import { useState, useEffect, useMemo } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import { getHistory, deleteAnalysis } from '../utils/storage';

export default function LibraryPage({ onViewAnalysis }) {
  const { t, language } = useLanguage();
  const sv = language === 'sv';
  const [history, setHistory] = useState([]);
  const [filter, setFilter] = useState('all');
  const [deletingId, setDeletingId] = useState(null);
  const [compareSelection, setCompareSelection] = useState([]);

  useEffect(() => {
    getHistory().then(setHistory).catch(() => setHistory([]));
  }, []);

  // Pre-compute blob URLs and clean up on history change / unmount
  const thumbnailUrls = useMemo(() => {
    const urls = new Map();
    history.forEach(item => {
      if (item.imageThumbnail) {
        urls.set(item.id || item.timestamp, URL.createObjectURL(item.imageThumbnail));
      }
    });
    return urls;
  }, [history]);

  useEffect(() => {
    return () => {
      thumbnailUrls.forEach(url => URL.revokeObjectURL(url));
    };
  }, [thumbnailUrls]);

  const filters = [
    { id: 'all', label: t('filters') },
    { id: 'best', label: t('bestScores') },
    { id: 'compare', label: sv ? 'Jämför' : 'Compare', icon: 'compare' },
  ];

  const filteredHistory = filter === 'best'
    ? [...history].sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0))
    : history;

  const isCompareMode = filter === 'compare';
  const compareReady = compareSelection.length === 2;
  const [compareA, compareB] = compareReady
    ? [history.find(h => (h.id || h.timestamp) === compareSelection[0]),
       history.find(h => (h.id || h.timestamp) === compareSelection[1])]
    : [null, null];

  const handleCompareToggle = (item) => {
    const id = item.id || item.timestamp;
    setCompareSelection(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 2) return [prev[1], id]; // Replace oldest
      return [...prev, id];
    });
  };

  return (
    <div className="px-6 pt-8 pb-8 max-w-7xl mx-auto space-y-8">
      {/* Hero */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-2">
          <h2 className="font-headline text-5xl md:text-6xl font-bold tracking-tighter uppercase">
            {t('libraryTitle')}
          </h2>
          <div className="flex items-center gap-3">
            <span className="text-on-surface-variant text-sm font-medium">
              {t('analyzedSwings', { count: history.length })}
            </span>
          </div>
        </div>
        <label className="bg-primary-fixed text-on-primary-fixed font-bold py-3 px-6 rounded-full flex items-center gap-2 active:scale-95 duration-200 cursor-pointer shadow-[0_4px_20px_rgba(157,255,0,0.2)] text-sm w-fit">
          <span className="material-symbols-outlined text-lg">add_to_photos</span>
          {t('importFromPhotos')}
          <input type="file" accept="video/*" className="hidden" />
        </label>
      </div>

      {/* Filter Chips */}
      <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
        {filters.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-5 py-2 rounded-full font-label text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-all ${
              filter === f.id
                ? 'bg-primary-fixed text-on-primary-fixed'
                : 'bg-surface-container-high text-on-surface-variant border border-outline-variant/15 hover:border-primary-fixed/30'
            }`}
          >
            {f.id === 'all' && <span className="material-symbols-outlined text-sm mr-1 align-middle">filter_list</span>}
            {f.label}
          </button>
        ))}
      </div>

      {/* Library Grid */}
      {filteredHistory.length === 0 ? (
        <div className="bg-surface-container rounded-lg p-16 flex flex-col items-center justify-center text-center">
          <span className="material-symbols-outlined text-outline-variant text-6xl mb-4">video_library</span>
          <p className="text-on-surface-variant font-label">{t('noAnalysesYet')}</p>
          <p className="text-on-surface-variant/60 font-label text-sm mt-1">{t('startFirstAnalysis')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Featured card — first item spans 2 columns */}
          {filteredHistory.length > 0 && (
            <button
              onClick={() => onViewAnalysis(filteredHistory[0])}
              className="group col-span-2 row-span-2 relative rounded-lg overflow-hidden bg-surface-container border border-outline-variant/10 hover:shadow-[0_10px_30px_rgba(0,0,0,0.4)] transition-all text-left"
            >
              {/* Delete button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const id = filteredHistory[0].id;
                  if (deletingId === id) {
                    deleteAnalysis(id).then(() => {
                      setHistory(h => h.filter(x => x.id !== id));
                      setDeletingId(null);
                    });
                  } else {
                    setDeletingId(id);
                    setTimeout(() => setDeletingId(null), 3000);
                  }
                }}
                className={`absolute top-3 right-3 z-10 p-1.5 rounded-full backdrop-blur-sm transition-all ${
                  deletingId === filteredHistory[0].id
                    ? 'bg-error text-white scale-110'
                    : 'bg-black/40 text-white/60 hover:text-white opacity-0 group-hover:opacity-100'
                }`}
              >
                <span className="material-symbols-outlined text-sm">
                  {deletingId === filteredHistory[0].id ? 'check' : 'delete'}
                </span>
              </button>
              <div className="relative h-full min-h-[300px]">
                {thumbnailUrls.get(filteredHistory[0].id || filteredHistory[0].timestamp) ? (
                  <img
                    src={thumbnailUrls.get(filteredHistory[0].id || filteredHistory[0].timestamp)}
                    alt="Swing"
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-surface-container-high">
                    <span className="material-symbols-outlined text-outline-variant text-8xl">sports_golf</span>
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
                <div className="absolute bottom-6 left-6 right-6">
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-on-surface-variant text-xs font-medium mb-1">
                        {new Date(filteredHistory[0].timestamp).toLocaleDateString()}
                      </p>
                      <p className="text-on-surface font-headline text-2xl font-bold">
                        {filteredHistory[0].coaching?.categories?.[0]?.name || 'Analysis'}
                      </p>
                    </div>
                    <span className="text-primary-fixed font-headline text-4xl font-black drop-shadow-[0_0_10px_rgba(157,255,0,0.3)]">
                      {filteredHistory[0].totalScore}
                    </span>
                  </div>
                </div>
              </div>
            </button>
          )}

          {/* Rest of items */}
          {filteredHistory.slice(isCompareMode ? 0 : 1).map((item, i) => {
            const itemId = item.id || item.timestamp;
            const isSelected = compareSelection.includes(itemId);
            const selIndex = compareSelection.indexOf(itemId);
            return (
            <button
              key={item.id || i}
              onClick={() => isCompareMode ? handleCompareToggle(item) : onViewAnalysis(item)}
              className={`group relative rounded-lg overflow-hidden bg-surface-container border transition-all text-left aspect-square ${
                isCompareMode && isSelected
                  ? 'border-primary-fixed shadow-[0_0_20px_rgba(157,255,0,0.2)]'
                  : 'border-outline-variant/10 hover:shadow-[0_10px_30px_rgba(0,0,0,0.4)]'
              }`}
            >
              {/* Compare selection badge */}
              {isCompareMode && isSelected && (
                <div className="absolute top-2 left-2 z-10 w-6 h-6 bg-primary-fixed text-on-primary-fixed rounded-full flex items-center justify-center font-bold text-xs">
                  {selIndex + 1}
                </div>
              )}
              {/* Delete button */}
              {!isCompareMode && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const id = item.id;
                  if (deletingId === id) {
                    deleteAnalysis(id).then(() => {
                      setHistory(h => h.filter(x => x.id !== id));
                      setDeletingId(null);
                    });
                  } else {
                    setDeletingId(id);
                    setTimeout(() => setDeletingId(null), 3000);
                  }
                }}
                className={`absolute top-2 right-2 z-10 p-1 rounded-full backdrop-blur-sm transition-all ${
                  deletingId === item.id
                    ? 'bg-error text-white scale-110'
                    : 'bg-black/40 text-white/60 hover:text-white opacity-0 group-hover:opacity-100'
                }`}
              >
                <span className="material-symbols-outlined text-xs">
                  {deletingId === item.id ? 'check' : 'delete'}
                </span>
              </button>
              )}
              {thumbnailUrls.get(item.id || item.timestamp) ? (
                <img
                  src={thumbnailUrls.get(item.id || item.timestamp)}
                  alt="Swing"
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-surface-container-high">
                  <span className="material-symbols-outlined text-outline-variant text-4xl">sports_golf</span>
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
              <div className="absolute bottom-3 left-3 right-3 flex justify-between items-end">
                <span className="text-on-surface text-xs font-medium">
                  {new Date(item.timestamp).toLocaleDateString()}
                </span>
                <span className={`font-headline font-bold text-lg ${
                  (item.totalScore || 0) >= 80 ? 'text-primary-fixed' : (item.totalScore || 0) >= 70 ? 'text-on-surface' : 'text-error'
                }`}>
                  {item.totalScore}
                </span>
              </div>
            </button>
            );
          })}
        </div>
      )}

      {/* Compare Instructions */}
      {isCompareMode && !compareReady && history.length >= 2 && (
        <div className="bg-surface-container rounded-lg p-5 border border-primary-fixed/15 text-center">
          <span className="material-symbols-outlined text-primary-fixed text-2xl mb-2 block">compare</span>
          <p className="text-on-surface font-bold text-sm">
            {sv ? `Välj ${2 - compareSelection.length} sessioner till` : `Select ${2 - compareSelection.length} more session${2 - compareSelection.length > 1 ? 's' : ''}`}
          </p>
          <p className="text-on-surface-variant text-xs mt-1">
            {sv ? 'Klicka på korten ovan för att jämföra' : 'Tap the cards above to compare'}
          </p>
        </div>
      )}

      {/* Comparison Panel */}
      {isCompareMode && compareReady && compareA && compareB && (
        <div className="bg-surface-container rounded-lg p-6 border border-primary-fixed/15 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary-fixed">compare</span>
              <span className="font-headline font-bold text-sm uppercase tracking-widest">
                {sv ? 'Jämförelse' : 'Comparison'}
              </span>
            </div>
            <button
              onClick={() => setCompareSelection([])}
              className="text-on-surface-variant text-xs font-bold uppercase tracking-widest hover:text-on-surface"
            >
              {sv ? 'Rensa' : 'Clear'}
            </button>
          </div>

          {/* Side by side thumbnails */}
          <div className="grid grid-cols-2 gap-4">
            {[compareA, compareB].map((item, idx) => (
              <div key={idx} className="space-y-2">
                <div className="aspect-square rounded-lg overflow-hidden bg-surface-container-high relative">
                  {thumbnailUrls.get(item.id || item.timestamp) ? (
                    <img src={thumbnailUrls.get(item.id || item.timestamp)} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="material-symbols-outlined text-outline-variant text-3xl">sports_golf</span>
                    </div>
                  )}
                  <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-sm text-white text-[10px] font-bold">
                    {idx === 0 ? (sv ? 'Före' : 'Before') : (sv ? 'Efter' : 'After')}
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-on-surface-variant text-[10px]">
                    {new Date(item.timestamp).toLocaleDateString(sv ? 'sv-SE' : 'en-US', { month: 'short', day: 'numeric' })}
                  </p>
                  <p className={`font-headline font-bold text-2xl ${
                    (item.totalScore || 0) >= 80 ? 'text-primary-fixed' : 'text-on-surface'
                  }`}>
                    {item.totalScore || '—'}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Score delta */}
          {compareA.totalScore && compareB.totalScore && (() => {
            const delta = compareB.totalScore - compareA.totalScore;
            const isImproved = delta > 0;
            return (
              <div className={`text-center p-4 rounded-lg ${isImproved ? 'bg-primary-fixed/5' : delta < 0 ? 'bg-error/5' : 'bg-surface-container-high'}`}>
                <span className="material-symbols-outlined text-lg mb-1 block" style={{ color: isImproved ? '#9DFF00' : delta < 0 ? '#FF4444' : '#999' }}>
                  {isImproved ? 'trending_up' : delta < 0 ? 'trending_down' : 'trending_flat'}
                </span>
                <p className="font-headline font-black text-2xl" style={{ color: isImproved ? '#9DFF00' : delta < 0 ? '#FF4444' : '#999' }}>
                  {delta > 0 ? '+' : ''}{delta}
                </p>
                <p className="text-on-surface-variant text-xs mt-1">
                  {isImproved ? (sv ? 'Poäng förbättring' : 'Score improvement') :
                   delta < 0 ? (sv ? 'Poäng nedgång' : 'Score decrease') :
                   (sv ? 'Ingen förändring' : 'No change')}
                </p>
              </div>
            );
          })()}

          {/* Metric comparison */}
          {compareA.coaching?.categories && compareB.coaching?.categories && (
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
                {sv ? 'Kategoripoäng' : 'Category Scores'}
              </p>
              {compareA.coaching.categories.slice(0, 5).map((catA, i) => {
                const catB = compareB.coaching?.categories?.[i];
                if (!catB) return null;
                const diff = (catB.score || 0) - (catA.score || 0);
                return (
                  <div key={i} className="flex items-center justify-between py-1.5 border-b border-outline-variant/5">
                    <span className="text-on-surface text-xs font-medium flex-1 truncate">{catA.name}</span>
                    <span className="text-on-surface-variant text-xs w-10 text-right">{catA.score || '—'}</span>
                    <span className="text-on-surface-variant text-xs w-6 text-center">→</span>
                    <span className="text-on-surface text-xs w-10 text-right font-bold">{catB.score || '—'}</span>
                    <span className={`text-xs w-10 text-right font-bold ${diff > 0 ? 'text-primary-fixed' : diff < 0 ? 'text-error' : 'text-on-surface-variant'}`}>
                      {diff > 0 ? `+${diff}` : diff === 0 ? '—' : diff}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
