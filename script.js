let currentSlides = [];
let currentSlideIndex = 0;
let currentUsername = 'tiktok_user'; 

async function fetchData() {
    const url = document.getElementById('urlInput').value;
    const btn = document.getElementById('downloadBtn');
    const loader = document.getElementById('loader');
    const resultArea = document.getElementById('resultArea');
    const videoContainer = document.getElementById('videoContainer');
    const photoContainer = document.getElementById('photoContainer');

    if (!url) return alert('Please paste a TikTok link first!');

    // UI Loading State
    btn.classList.add('hidden');
    loader.classList.remove('hidden');
    resultArea.classList.add('hidden');

    try {
        const response = await fetch(`/api/download?url=${encodeURIComponent(url)}`);
        const data = await response.json();

        if (data.error) throw new Error(data.error);

        // Populate Data UI
        currentUsername = data.username || 'tiktok_user';
        document.getElementById('resUsername').textContent = `@${data.username}`;
        document.getElementById('resViews').textContent = data.views;
        document.getElementById('resLikes').textContent = data.likes;

        resultArea.classList.remove('hidden');

        // Reset Displays
        videoContainer.classList.add('hidden');
        photoContainer.classList.add('hidden');

        if (data.type === 'video') {
            videoContainer.classList.remove('hidden');
            const videoUrl = data.downloads.nowm[0] || data.downloads.wm[0];
            const audioUrl = data.mp3[0];
            
            // Set Preview Video
            document.getElementById('videoPlayer').src = videoUrl;
            
            // --- LOGIKA TOMBOL VIDEO (Auto Download) ---
            const btnVideo = document.getElementById('btnVideoNowm');
            // Hapus href default agar tidak membuka tab
            btnVideo.removeAttribute('href');
            // Override klik dengan fungsi download paksa
            btnVideo.onclick = (e) => {
                e.preventDefault();
                forceDownload(videoUrl, `${currentUsername}_video.mp4`, btnVideo);
            };
            
            // --- LOGIKA TOMBOL AUDIO (Auto Download & Fix Access Denied) ---
            const btnAudio = document.getElementById('btnAudio');
            if(audioUrl) {
                btnAudio.style.display = 'block';
                btnAudio.removeAttribute('href');
                btnAudio.onclick = (e) => {
                    e.preventDefault();
                    forceDownload(audioUrl, `${currentUsername}_audio.mp3`, btnAudio);
                };
            } else {
                btnAudio.style.display = 'none';
            }

        } else if (data.type === 'photo') {
            photoContainer.classList.remove('hidden');
            setupSlider(data.slides);
        }

    } catch (error) {
        alert('Error: ' + error.message);
    } finally {
        btn.classList.remove('hidden');
        loader.classList.add('hidden');
    }
}

/**
 * FUNGSI INTI: Force Download & Bypass Access Denied
 * Menggunakan referrerPolicy: 'no-referrer' untuk menghindari Error 403 TikTok
 */
async function forceDownload(url, filename, btnElement = null) {
    let originalText = '';
    
    // Efek visual pada tombol saat proses download berjalan
    if(btnElement) {
        originalText = btnElement.innerText;
        btnElement.innerText = "Downloading... (Please Wait)";
        btnElement.style.opacity = "0.7";
        btnElement.style.pointerEvents = "none";
    }

    try {
        // Fetch file sebagai BLOB. 
        // PENTING: referrerPolicy: 'no-referrer' mencegah browser mengirim header Referer
        // yang menyebabkan "Access Denied" pada link TikTok.
        const response = await fetch(url, { 
            referrerPolicy: 'no-referrer' 
        });

        if (!response.ok) throw new Error('Network response was not ok');
        
        const blob = await response.blob();
        
        // Buat URL lokal di browser
        const blobUrl = window.URL.createObjectURL(blob);
        
        // Buat elemen <a> virtual untuk men-trigger download
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = filename; // Atribut ini memaksa file tersimpan
        
        document.body.appendChild(link);
        link.click(); // Klik otomatis
        
        // Bersihkan memori
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);

    } catch (error) {
        console.error('Download failed:', error);
        alert("Gagal download otomatis. Mengalihkan ke tab baru...");
        // Fallback terakhir: buka tab baru jika fetch benar-benar diblokir browser
        window.open(url, '_blank');
    } finally {
        // Kembalikan tombol ke kondisi semula
        if(btnElement) {
            btnElement.innerText = originalText;
            btnElement.style.opacity = "1";
            btnElement.style.pointerEvents = "auto";
        }
    }
}

// --- Logic Slider Foto ---
function setupSlider(slides) {
    currentSlides = slides;
    currentSlideIndex = 0;
    
    const track = document.getElementById('sliderTrack');
    track.innerHTML = ''; 

    slides.forEach(slide => {
        const img = document.createElement('img');
        img.src = slide.url;
        track.appendChild(img);
    });

    updateSlideUI();
    
    // Tombol Download All (Looping Download)
    const downloadAllBtn = document.getElementById('downloadAllBtn');
    downloadAllBtn.onclick = async () => {
        const originalText = downloadAllBtn.innerText;
        downloadAllBtn.innerText = "Downloading all photos...";
        
        for (let i = 0; i < currentSlides.length; i++) {
            // Beri jeda 1 detik per foto agar browser tidak nge-freeze
            await new Promise(r => setTimeout(r, 1000));
            // Panggil fungsi download yang sama (tanpa tombol loading visual per foto)
            await forceDownload(currentSlides[i].url, `${currentUsername}_slide_${i+1}.jpg`);
        }
        
        downloadAllBtn.innerText = originalText;
    };
}

function moveSlide(direction) {
    const total = currentSlides.length;
    currentSlideIndex += direction;

    if (currentSlideIndex < 0) currentSlideIndex = total - 1;
    if (currentSlideIndex >= total) currentSlideIndex = 0;

    updateSlideUI();
}

function updateSlideUI() {
    const track = document.getElementById('sliderTrack');
    const counter = document.getElementById('slideCounter');
    
    track.style.transform = `translateX(-${currentSlideIndex * 100}%)`;
    counter.textContent = `${currentSlideIndex + 1} / ${currentSlides.length}`;

    // Update tombol download untuk foto yang sedang aktif
    const currentUrl = currentSlides[currentSlideIndex].url;
    const btn = document.getElementById('btnDownloadCurrentSlide');
    
    // Reset event listener lama agar tidak menumpuk
    btn.onclick = null;
    btn.onclick = () => {
        forceDownload(currentUrl, `${currentUsername}_slide_${currentSlideIndex + 1}.jpg`, btn);
    };
}
