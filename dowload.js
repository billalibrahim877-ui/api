const axios = require('axios');
const cheerio = require('cheerio');

/**
 * Follow short URL (vt.tiktok.com) to get final URL
 */
async function expandUrl(inputUrl) {
  try {
    const res = await axios.get(inputUrl, { maxRedirects: 5, validateStatus: null });
    // responseUrl bisa berada di beberapa properti tergantung environment
    return res.request?.res?.responseUrl || res.config?.url || inputUrl;
  } catch (err) {
    // fallback ke original jika gagal
    return inputUrl;
  }
}

const defaultHeaders = {
  'Content-Type': 'application/x-www-form-urlencoded',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  Origin: 'https://savett.cc',
  Referer: 'https://savett.cc/en1/download',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
};

async function getCsrf() {
  const res = await axios.get('https://savett.cc/en1/download', {
    headers: { 'User-Agent': defaultHeaders['User-Agent'], Accept: 'text/html' },
    validateStatus: () => true
  });

  const body = res.data || '';
  const csrf = (body.match(/name="csrf_token" value="([^"]+)"/) || [])[1] || null;

  const setCookie = Array.isArray(res.headers['set-cookie']) ? res.headers['set-cookie'] : [];
  const cookie = setCookie.map(c => (typeof c === 'string' ? c.split(';')[0] : '')).filter(Boolean).join('; ');

  return { csrf, cookie, body };
}

async function postUrl(url, csrf, cookie) {
  const payload = `csrf_token=${encodeURIComponent(csrf || '')}&url=${encodeURIComponent(url)}`;
  const res = await axios.post('https://savett.cc/en1/download', payload, {
    headers: { ...defaultHeaders, Cookie: cookie || '' },
    validateStatus: () => true
  });
  return res.data || '';
}

function parseHtml(html) {
  const $ = cheerio.load(html || '');

  const stats = [];
  $('#video-info .my-1 span').each((_, el) => stats.push($(el).text().trim()));

  const data = {
    username: $('#video-info h3').first().text().trim() || null,
    views: stats[0] || null,
    likes: stats[1] || null,
    comments: stats[3] || null,
    shares: stats[4] || null,
    duration: ($('#video-info p.text-muted').first().text().replace(/Duration:/i, '').trim() || null),
    type: 'video',
    downloads: { nowm: [], wm: [] },
    mp3: [],
    slides: []
  };

  // Photo slides
  const slides = $('.carousel-item[data-data]');
  if (slides.length) {
    data.type = 'photo';
    slides.each((_, el) => {
      try {
        const json = JSON.parse($(el).attr('data-data').replace(/&quot;/g, '"'));
        if (Array.isArray(json.URL)) {
          json.URL.forEach(url => data.slides.push({ index: data.slides.length + 1, url }));
        }
      } catch {}
    });
    return data;
  }

  // Video formats
  $('#formatselect option').each((_, el) => {
    const label = $(el).text().toLowerCase();
    const raw = $(el).attr('value');
    if (!raw) return;
    try {
      const json = JSON.parse(raw.replace(/&quot;/g, '"'));
      if (!json.URL) return;
      if (label.includes('mp4') && !label.includes('watermark')) data.downloads.nowm.push(...json.URL);
      if (label.includes('watermark')) data.downloads.wm.push(...json.URL);
      if (label.includes('mp3')) data.mp3.push(...json.URL);
    } catch {}
  });

  return data;
}

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const rawUrl = (req.query && req.query.url) || null;
    if (!rawUrl) return res.status(400).json({ error: 'URL is required' });

    // Expand short links (vt.tiktok.com)
    const finalUrl = await expandUrl(rawUrl);

    // Get csrf + cookies safely
    const { csrf, cookie } = await getCsrf();
    if (!csrf) {
      // provider changed form — avoid returning HTML; return concise message
      return res.status(502).json({ error: 'Provider token not found' });
    }

    // Post to provider
    const html = await postUrl(finalUrl, csrf, cookie);

    // If provider sent error text, detect and return minimal error
    if (typeof html === 'string' && html.includes('The string did not match the expected pattern')) {
      return res.status(422).json({ error: 'Provider validation error' });
    }

    const result = parseHtml(html);

    if (!result.username && result.type === 'video' && result.downloads.nowm.length === 0 && result.downloads.wm.length === 0 && result.mp3.length === 0 && result.slides.length === 0) {
      return res.status(502).json({ error: 'Failed to parse provider response' });
    }

    return res.status(200).json(result);
  } catch (err) {
    // minimal error response; detailed error logged for debugging only
    console.error('API_ERROR', err && err.stack ? err.stack : err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
