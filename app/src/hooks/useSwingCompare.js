import { useState } from 'react';
import { useLanguage } from '../i18n/LanguageContext';

export function useSwingCompare() {
  const { t, language } = useLanguage();
  
  // State for both videos
  const [videoA, setVideoA] = useState(null); // { file, url, impactTime }
  const [videoB, setVideoB] = useState(null); // { file, url, impactTime }
  
  const [status, setStatus] = useState('idle'); // idle -> locating_impact -> ready -> error
  const [error, setError] = useState(null);

  const extractImpactTime = async (file) => {
    try {
      const { extractFrames } = await import('../utils/videoFrames.js');
      // The heuristic dense sampling automatically identifies 'impact'
      const frames = await extractFrames(file, 8);
      const impactFrame = frames.find(f => f.phase === 'impact');
      return impactFrame ? impactFrame.timestamp : 0;
    } catch (err) {
      console.error('Failed to locate impact frame:', err);
      return 0; // fallback to start of video
    }
  };

  const setVideo = async (file, type) => {
    if (!file || !file.type.startsWith('video/')) {
      setError(language === 'sv' ? 'Välj en giltig videofil.' : 'Please select a valid video file.');
      return;
    }

    setStatus('locating_impact');
    const url = URL.createObjectURL(file);
    const impactTime = await extractImpactTime(file);
    
    const videoData = { file, url, impactTime };
    
    if (type === 'A') {
      setVideoA(videoData);
    } else {
      setVideoB(videoData);
    }
    
    setStatus('ready');
  };

  const clearVideos = () => {
    if (videoA?.url) URL.revokeObjectURL(videoA.url);
    if (videoB?.url) URL.revokeObjectURL(videoB.url);
    setVideoA(null);
    setVideoB(null);
    setStatus('idle');
    setError(null);
  };

  return {
    videoA,
    videoB,
    status,
    error,
    setVideo,
    clearVideos
  };
}
