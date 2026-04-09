import { useState, useRef, useEffect, useCallback } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import { useSwingCompare } from '../hooks/useSwingCompare';

export default function ComparePage() {
  const { t, language } = useLanguage();
  const { videoA, videoB, status, error, setVideo, clearVideos } = useSwingCompare();

  const [viewMode, setViewMode] = useState('side-by-side'); // 'side-by-side' | 'overlay'
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(0.5); // Slow motion by default
  const [progress, setProgress] = useState(0); // 0 to 100

  const videoARef = useRef(null);
  const videoBRef = useRef(null);
  const requestRef = useRef();

  // Handle Play/Pause
  const togglePlay = () => {
    if (isPlaying) {
      videoARef.current?.pause();
      videoBRef.current?.pause();
    } else {
      videoARef.current?.play();
      // We don't blindly play video B, we control it via rAF or let it play
      videoBRef.current?.play();
    }
    setIsPlaying(!isPlaying);
  };

  // Sync Video B to Video A using impact times
  const syncVideos = useCallback(() => {
    if (!videoARef.current || !videoBRef.current || !videoA || !videoB) return;
    
    // Master is Video A
    const timeA = videoARef.current.currentTime;
    
    // Calculate what time B should be at
    // timeA - impactA = timeB - impactB
    // timeB = timeA - impactA + impactB
    let targetTimeB = timeA - videoA.impactTime + videoB.impactTime;
    
    // Bound Time B
    if (targetTimeB < 0) targetTimeB = 0;
    if (targetTimeB > videoBRef.current.duration) targetTimeB = videoBRef.current.duration;

    // If drift is significant, force update Video B
    if (Math.abs(videoBRef.current.currentTime - targetTimeB) > 0.05) {
      if (!isPlaying) {
        videoBRef.current.currentTime = targetTimeB;
      } else {
        // Smooth adjustment if playing
        videoBRef.current.currentTime = targetTimeB;
      }
    }

    // Update progress bar based on VideoA length
    if (videoARef.current.duration) {
      setProgress((timeA / videoARef.current.duration) * 100);
    }

    if (isPlaying) {
      requestRef.current = requestAnimationFrame(syncVideos);
    }
  }, [isPlaying, videoA, videoB]);

  // Start Sync Loop
  useEffect(() => {
    if (isPlaying) {
      requestRef.current = requestAnimationFrame(syncVideos);
    } else if (videoA && videoB) {
      syncVideos(); // One off sync on pause
    }
    return () => cancelAnimationFrame(requestRef.current);
  }, [isPlaying, syncVideos, videoA, videoB]);

  // Handle Scrubber Change
  const handleSeek = (e) => {
    const val = parseFloat(e.target.value);
    setProgress(val);
    if (videoARef.current && videoA) {
      videoARef.current.currentTime = (val / 100) * videoARef.current.duration;
      syncVideos(); // sync B immediately
    }
  };

  // Handle Playback Rate
  useEffect(() => {
    if (videoARef.current) videoARef.current.playbackRate = playbackRate;
    if (videoBRef.current) videoBRef.current.playbackRate = playbackRate;
  }, [playbackRate]);

  // Reset logic when video reaches end
  useEffect(() => {
    const videoNode = videoARef.current;
    if (!videoNode) return;
    
    const handleEnded = () => {
      setIsPlaying(false);
      videoNode.currentTime = 0;
      syncVideos();
    };

    videoNode.addEventListener('ended', handleEnded);
    return () => videoNode.removeEventListener('ended', handleEnded);
  }, [syncVideos]);

  return (
    <div className="px-6 pt-8 pb-32 max-w-4xl mx-auto space-y-6">
      
      {/* Header */}
      <div className="flex flex-col mb-8 text-center">
        <h1 className="font-headline text-3xl font-bold bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent mb-2">
          {language === 'sv' ? 'Sving-Jämförelse' : 'Swing Compare'}
        </h1>
        <p className="text-on-surface-variant text-sm">
          {language === 'sv' ? 'Ladda upp två videos för att synkronisera och jämföra dina svingar punkt för punkt.' : 'Upload two videos to synchronize and compare your swings frame by frame.'}
        </p>
      </div>

      {/* Selectors when incomplete */}
      {(!videoA || !videoB) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Video A Selector */}
          <div className="relative rounded-lg border-2 border-dashed border-outline-variant/30 bg-surface-container p-8 flex flex-col items-center justify-center text-center">
            {videoA ? (
              <>
                <span className="material-symbols-outlined text-primary-fixed text-4xl mb-2">check_circle</span>
                <p className="font-bold text-on-surface">Video A Ready</p>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-on-surface-variant text-4xl mb-4">person</span>
                <p className="text-on-surface font-bold mb-4">Video A</p>
                <label className="kinetic-gradient text-on-primary-fixed font-bold py-3 px-6 rounded-full cursor-pointer shadow-[0_4px_20px_rgba(157,255,0,0.2)]">
                  {language === 'sv' ? 'Välj fil' : 'Select File'}
                  <input type="file" accept="video/*" className="hidden" onChange={(e) => setVideo(e.target.files[0], 'A')} />
                </label>
              </>
            )}
          </div>

          {/* Video B Selector */}
          <div className="relative rounded-lg border-2 border-dashed border-outline-variant/30 bg-surface-container p-8 flex flex-col items-center justify-center text-center">
            {videoB ? (
               <>
                <span className="material-symbols-outlined text-primary-fixed text-4xl mb-2">check_circle</span>
                <p className="font-bold text-on-surface">Video B Ready</p>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-on-surface-variant text-4xl mb-4">history</span>
                <p className="text-on-surface font-bold mb-4">Video B (Reference)</p>
                <label className="bg-surface-bright text-on-surface border border-outline-variant/30 font-bold py-3 px-6 rounded-full cursor-pointer">
                  {language === 'sv' ? 'Välj fil' : 'Select File'}
                  <input type="file" accept="video/*" className="hidden" onChange={(e) => setVideo(e.target.files[0], 'B')} />
                </label>
              </>
            )}
          </div>

          {status === 'locating_impact' && (
            <div className="md:col-span-2 text-center text-primary-fixed font-bold animate-pulse">
              {language === 'sv' ? 'Identifierar träffögonblick för synkronisering...' : 'Locating impact moment for sync...'}
            </div>
          )}

          {error && <div className="md:col-span-2 text-error text-center">{error}</div>}
        </div>
      )}

      {/* Synchronized Player UI */}
      {videoA && videoB && status === 'ready' && (
        <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500">
          
          {/* View Toggles */}
          <div className="flex bg-surface-container-high rounded-full p-1 border border-outline-variant/10 w-fit mx-auto">
            <button 
              onClick={() => setViewMode('side-by-side')}
              className={`px-6 py-2 rounded-full text-xs font-bold uppercase tracking-wide transition-all ${viewMode === 'side-by-side' ? 'bg-primary-fixed text-on-primary-fixed' : 'text-on-surface-variant hover:text-on-surface'}`}
            >
              Side-by-Side
            </button>
            <button 
              onClick={() => setViewMode('overlay')}
              className={`px-6 py-2 rounded-full text-xs font-bold uppercase tracking-wide transition-all ${viewMode === 'overlay' ? 'bg-primary-fixed text-on-primary-fixed' : 'text-on-surface-variant hover:text-on-surface'}`}
            >
              Ghost Overlay
            </button>
          </div>

          {/* Player Area */}
          <div className="relative w-full rounded-2xl overflow-hidden bg-black border border-outline-variant/20 shadow-2xl">
            {viewMode === 'side-by-side' ? (
              <div className="flex w-full h-[60vh]">
                <div className="w-1/2 border-r border-white/20 relative">
                  <span className="absolute top-4 left-4 z-10 bg-black/60 px-3 py-1 rounded-full text-xs font-bold text-white uppercase tracking-widest backdrop-blur-md">Video A</span>
                  <video ref={videoARef} src={videoA.url} className="w-full h-full object-contain" muted playsInline />
                </div>
                <div className="w-1/2 relative">
                  <span className="absolute top-4 left-4 z-10 bg-black/60 px-3 py-1 rounded-full text-xs font-bold text-white uppercase tracking-widest backdrop-blur-md">Video B</span>
                  <video ref={videoBRef} src={videoB.url} className="w-full h-full object-contain" muted playsInline />
                </div>
              </div>
            ) : (
              <div className="relative w-full h-[60vh] flex justify-center bg-black">
                 {/* Ghost Overlay */}
                 <video ref={videoARef} src={videoA.url} className="absolute inset-0 w-full h-full object-contain" muted playsInline />
                 <video ref={videoBRef} src={videoB.url} className="absolute inset-0 w-full h-full object-contain opacity-50 mix-blend-screen" muted playsInline />
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="glass-panel p-6 rounded-2xl space-y-6">
            
            {/* Scrubber */}
            <div className="w-full">
              <input
                type="range"
                min="0"
                max="100"
                step="0.1"
                value={progress}
                onChange={handleSeek}
                className="w-full h-2 bg-surface-bright rounded-lg appearance-none cursor-pointer accent-primary-fixed"
              />
            </div>

            {/* Transport */}
            <div className="flex items-center justify-between">
              
              <div className="flex gap-2">
                <button 
                  onClick={() => {
                    const speeds = [0.25, 0.5, 1.0];
                    const next = speeds[(speeds.indexOf(playbackRate) + 1) % speeds.length];
                    setPlaybackRate(next);
                  }}
                  className="bg-surface-container-high hover:bg-surface-bright text-on-surface font-bold rounded-full px-4 h-12 flex items-center justify-center text-xs transition-colors border border-outline-variant/10"
                >
                  {playbackRate}x
                </button>
              </div>

              <button 
                onClick={togglePlay}
                className="w-16 h-16 bg-primary-fixed text-on-primary-fixed rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-transform shadow-[0_0_30px_rgba(157,255,0,0.3)]"
              >
                <span className="material-symbols-filled text-4xl leading-none">
                  {isPlaying ? 'pause' : 'play_arrow'}
                </span>
              </button>

              <button 
                onClick={clearVideos}
                className="bg-surface-container-high hover:bg-error/20 hover:text-error hover:border-error/30 text-on-surface-variant font-bold rounded-full px-5 h-12 flex items-center justify-center transition-colors border border-outline-variant/10 text-xs uppercase tracking-widest gap-2"
              >
                <span className="material-symbols-outlined text-sm">close</span>
                {language === 'sv' ? 'Rensa' : 'Clear'}
              </button>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
