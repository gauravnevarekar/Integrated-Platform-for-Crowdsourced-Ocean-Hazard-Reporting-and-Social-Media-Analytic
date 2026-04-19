import React, { useState, useEffect, useMemo } from 'react';
import maplibregl from 'maplibre-gl';
import Map, { Source, Layer, Marker, Popup, NavigationControl, FullscreenControl } from 'react-map-gl';
import type { CircleLayer, HeatmapLayer, SymbolLayer } from 'react-map-gl';
import { ShieldAlert, AlertTriangle, Filter, Activity, Clock, Map as MapIcon, AlertCircle, TrendingUp, Layers } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { HazardReport, Severity } from './types';

export default function App() {
  const [hazards, setHazards] = useState<HazardReport[]>([]);
  const [selectedHazard, setSelectedHazard] = useState<HazardReport | null>(null);
  const [viewState, setViewState] = useState({
    longitude: 75.0, // Indian Ocean avg lng
    latitude: -10.0, // Indian Ocean avg lat
    zoom: 3.5,
  });

  // Filters state
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [filterSeverity, setFilterSeverity] = useState<Severity | 'all'>('all');
  const [filterSource, setFilterSource] = useState<'all' | 'crowdsourced' | 'social_media'>('all');

  // Load initial data and connect to WebSocket
  useEffect(() => {
    // 1. Fetch initial static baseline representing a snapshot
    const generateMockData = (): HazardReport[] => {
      return [
        {
          id: '1', category_name: 'Oil Spill', title: 'Large slick spotted', description: 'Viscous fluid moving east',
          latitude: 10.5, longitude: 65.2, severity: 'critical', status: 'verified', trust_score: 95.5,
          photos: [], reported_at: new Date().toISOString(), reporter_name: 'Marine Guard', source: 'crowdsourced'
        },
        {
          id: '2', category_name: 'Rough Seas', title: '10m swells reported', description: 'Container ship reporting major waves',
          latitude: -20.0, longitude: 85.0, severity: 'high', status: 'reported', trust_score: 70.0,
          photos: [], reported_at: new Date().toISOString(), source: 'social_media'
        }
      ];
    };

    setHazards(generateMockData());

    // 2. Connect WebSocket to the live backend
    const ws = new WebSocket('ws://localhost:3000/ws/live');

    ws.onopen = () => console.log('Connected to live hazard feed.');
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'NEW_HAZARD') {
          setHazards(prev => [data.payload, ...prev]);
        }
      } catch (err) {
        console.error('Failed processing WS message', err);
      }
    };

    return () => ws.close();
  }, []);

  // Filter the data
  const filteredHazards = useMemo(() => {
    return hazards.filter(h => {
      if (filterSeverity !== 'all' && h.severity !== filterSeverity) return false;
      if (filterSource !== 'all' && h.source !== filterSource) return false;
      return true;
    });
  }, [hazards, filterSeverity, filterSource]);

  // Convert to GeoJSON for Mapbox Heatmap/Clustering Source
  const geojsonData = useMemo(() => {
    return {
      type: 'FeatureCollection',
      features: filteredHazards.map(h => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [h.longitude, h.latitude] },
        properties: { ...h }
      }))
    };
  }, [filteredHazards]);

  // Statistics
  const stats = useMemo(() => {
    const criticalCount = hazards.filter(h => h.severity === 'critical').length;
    const last24h = hazards.filter(h => new Date(h.reported_at).getTime() > Date.now() - 86400000).length;
    return { total: hazards.length, critical: criticalCount, recent: last24h };
  }, [hazards]);

  // --- Mapbox Layers ---
  const clusterLayer: CircleLayer = {
    id: 'clusters',
    type: 'circle',
    source: 'earthquakes',
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': ['step', ['get', 'point_count'], '#15618A', 5, '#0F4463', 20, '#eab308'],
      'circle-radius': ['step', ['get', 'point_count'], 15, 5, 20, 20, 25]
    }
  };

  const clusterCountLayer: SymbolLayer = {
    id: 'cluster-count',
    type: 'symbol',
    source: 'earthquakes',
    filter: ['has', 'point_count'],
    layout: {
      'text-field': '{point_count_abbreviated}',
      'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
      'text-size': 12
    },
    paint: { 'text-color': '#ffffff' }
  };

  const heatmapLayer: HeatmapLayer = {
    id: 'heatmap',
    type: 'heatmap',
    paint: {
      'heatmap-weight': ['interpolate', ['linear'], ['get', 'trust_score'], 0, 0, 100, 1],
      'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1, 9, 3],
      'heatmap-color': [
        'interpolate', ['linear'], ['heatmap-density'],
        0, 'rgba(33,102,172,0)', 0.2, 'rgb(103,169,207)', 0.4, 'rgb(209,229,240)',
        0.6, 'rgb(253,219,199)', 0.8, 'rgb(239,138,98)', 1, 'rgb(178,24,43)'
      ],
      'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 2, 9, 20],
      'heatmap-opacity': 0.8
    }
  };

  // Helper for Marker Colors
  const getMarkerColor = (severity: Severity) => {
    switch (severity) {
      case 'low': return 'bg-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.6)]';
      case 'medium': return 'bg-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.6)]';
      case 'high': return 'bg-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.6)]';
      case 'critical': return 'bg-neon-coral shadow-[0_0_20px_rgba(255,92,92,0.8)] animate-pulse';
      default: return 'bg-gray-500';
    }
  };

  return (
    <div className="flex h-screen w-full bg-ocean-950 text-slate-200 overflow-hidden font-sans">

      {/* LEFT SIDEBAR: Premium Glass Pane */}
      <motion.aside
        initial={{ x: -300, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="w-80 glass-panel border-r-0 border-r-white/5 flex flex-col z-20"
      >
        <div className="p-6 border-b border-white/10 flex items-center gap-4 relative overflow-hidden">
          {/* Decorative glow behind logo */}
          <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-neon-cyan/20 to-transparent blur-2xl -z-10" />

          <div className="p-2.5 bg-ocean-900 rounded-xl border border-white/10 shadow-[0_0_15px_rgba(0,240,255,0.2)]">
            <ShieldAlert className="text-neon-cyan w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold tracking-tight text-white leading-none">
              Ocean<span className="text-gradient">Sentinel</span>
            </h1>
            <p className="text-[10px] text-ocean-400 font-medium tracking-widest uppercase mt-1">Global Hazard Intelligence</p>
          </div>
        </div>

        <div className="p-6 flex-1 overflow-y-auto">
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-6 flex items-center gap-2">
            <Filter className="w-4 h-4 text-neon-emerald" /> Mission Parameters
          </h2>

          <div className="space-y-8">
            {/* Severity Filter */}
            <div className="space-y-3">
              <label className="text-xs font-semibold text-white/70 block uppercase tracking-wider">Threat Level</label>
              <div className="relative">
                <select
                  value={filterSeverity}
                  onChange={e => setFilterSeverity(e.target.value as any)}
                  className="w-full appearance-none bg-ocean-900/80 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-neon-cyan/50 focus:border-neon-cyan outline-none transition-all cursor-pointer shadow-inner"
                >
                  <option value="all">All Severities</option>
                  <option value="low">Low (Monitoring)</option>
                  <option value="medium">Medium (Elevated)</option>
                  <option value="high">High (Severe)</option>
                  <option value="critical">Critical (Emergency)</option>
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none text-ocean-400">
                  <Layers className="w-4 h-4" />
                </div>
              </div>
            </div>

            {/* Source Filter */}
            <div className="space-y-3">
              <label className="text-xs font-semibold text-white/70 block uppercase tracking-wider">Intelligence Source</label>
              <div className="relative">
                <select
                  value={filterSource}
                  onChange={e => setFilterSource(e.target.value as any)}
                  className="w-full appearance-none bg-ocean-900/80 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-neon-cyan/50 focus:border-neon-cyan outline-none transition-all cursor-pointer shadow-inner"
                >
                  <option value="all">Global Feed (All)</option>
                  <option value="crowdsourced">Verified App Reports</option>
                  <option value="social_media">Social Intel</option>
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none text-ocean-400">
                  <Activity className="w-4 h-4" />
                </div>
              </div>
            </div>

            {/* Heatmap Toggle */}
            <div className="pt-6 border-t border-white/10">
              <label className="flex items-center justify-between cursor-pointer group">
                <span className="text-sm font-medium text-slate-300 group-hover:text-white transition-colors flex items-center gap-3">
                  <MapIcon className="w-5 h-5 text-ocean-400 group-hover:text-neon-cyan transition-colors" />
                  Thermal Map Layer
                </span>
                <div className={`relative w-12 h-6 rounded-full transition-colors duration-300 ease-in-out ${showHeatmap ? 'bg-neon-cyan shadow-[0_0_10px_rgba(0,240,255,0.4)]' : 'bg-ocean-900 border border-white/20'}`}
                  onClick={() => setShowHeatmap(!showHeatmap)}>
                  <motion.div
                    layout
                    className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow-sm`}
                    animate={{ x: showHeatmap ? 24 : 0 }}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Footer Area */}
        <div className="p-6 border-t border-white/10 bg-ocean-900/30">
          <div className="flex items-center gap-3 text-xs bg-neon-emerald/10 text-neon-emerald px-4 py-3 rounded-xl border border-neon-emerald/20 shadow-[0_0_15px_rgba(0,255,163,0.1)]">
            <div className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-neon-emerald opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-neon-emerald"></span>
            </div>
            <span className="font-medium tracking-wide">SYSTEM SECURE • LINK ACTIVE</span>
          </div>
        </div>
      </motion.aside>

      {/* MAIN VIEW */}
      <main className="flex-1 flex flex-col relative z-0">

        {/* TOP STATS FLOATING CARDS */}
        <header className="absolute top-6 left-6 right-6 z-10 flex gap-4 pointer-events-none">

          <motion.div
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="glass-card px-6 py-4 flex items-center gap-4 pointer-events-auto min-w-[200px]"
          >
            <div className="p-3 bg-blue-500/10 rounded-xl border border-blue-500/20">
              <Activity className="text-blue-400 w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-1">Active Threats</p>
              <div className="flex items-baseline gap-2">
                <p className="text-2xl font-display font-bold text-white leading-none">{stats.total}</p>
                <span className="text-xs text-blue-400 flex items-center"><TrendingUp className="w-3 h-3 mr-0.5" /> Live</span>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="glass-card px-6 py-4 flex items-center gap-4 pointer-events-auto min-w-[200px]"
          >
            <div className="p-3 bg-neon-coral/10 rounded-xl border border-neon-coral/20 relative">
              <div className="absolute inset-0 bg-neon-coral/20 blur-md rounded-xl animate-pulse" />
              <AlertTriangle className="text-neon-coral w-6 h-6 relative z-10" />
            </div>
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-1">Critical Priority</p>
              <p className="text-2xl font-display font-bold text-white leading-none">{stats.critical}</p>
            </div>
          </motion.div>

          <motion.div
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="glass-card px-6 py-4 flex items-center gap-4 pointer-events-auto min-w-[200px]"
          >
            <div className="p-3 bg-neon-emerald/10 rounded-xl border border-neon-emerald/20">
              <Clock className="text-neon-emerald w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-1">T-Minus 24H</p>
              <div className="flex items-baseline gap-2">
                <p className="text-2xl font-display font-bold text-white leading-none">+{stats.recent}</p>
                <span className="text-[10px] text-slate-400 font-medium">Incidents</span>
              </div>
            </div>
          </motion.div>

        </header>

        {/* MAPBOX CONTAINER */}
        <div className="flex-1 w-full h-full bg-ocean-950">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.5 }}
            className="w-full h-full relative"
          >
            {/* Subtle vignette over the map for cinematic feel */}
            <div className="absolute inset-0 pointer-events-none shadow-[inset_0_0_150px_rgba(2,12,23,0.8)] z-10" />

            <Map
              {...viewState}
              onMove={evt => setViewState(evt.viewState)}
              mapLib={maplibregl as any}
              mapStyle="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
              interactiveLayerIds={showHeatmap ? [] : ['clusters']}
            >
              <FullscreenControl position="bottom-right" />
              <NavigationControl position="bottom-right" />

              <Source
                id="hazards"
                type="geojson"
                // @ts-ignore
                data={geojsonData}
                cluster={!showHeatmap}
                clusterMaxZoom={14}
                clusterRadius={50}
              >
                {showHeatmap ? (
                  <Layer {...heatmapLayer} />
                ) : (
                  <>
                    <Layer {...clusterLayer} />
                    <Layer {...clusterCountLayer} />
                  </>
                )}
              </Source>

              {!showHeatmap && filteredHazards.map((hazard) => (
                <Marker
                  key={hazard.id}
                  longitude={hazard.longitude}
                  latitude={hazard.latitude}
                  anchor="center"
                  onClick={e => {
                    e.originalEvent.stopPropagation();
                    setSelectedHazard(hazard);
                    setViewState({ ...viewState, longitude: hazard.longitude, latitude: hazard.latitude, zoom: 8 });
                  }}
                >
                  <motion.div
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 400, damping: 15 }}
                    className="relative group cursor-pointer"
                  >
                    {/* Pulsing rings for interactive feel */}
                    <div className="absolute -inset-2 rounded-full border border-white/20 opacity-0 group-hover:opacity-100 group-hover:animate-ping transition-all duration-300" />

                    <div className={`w-5 h-5 rounded-full border-[3px] border-ocean-950 ${getMarkerColor(hazard.severity)} transition-transform duration-300 group-hover:scale-125 z-10 relative`} />
                  </motion.div>
                </Marker>
              ))}

              {/* PREMIUM POPUP */}
              {selectedHazard && (
                <Popup
                  longitude={selectedHazard.longitude}
                  latitude={selectedHazard.latitude}
                  anchor="bottom"
                  offset={15}
                  onClose={() => setSelectedHazard(null)}
                  closeOnClick={false}
                  className="premium-popup z-20"
                  maxWidth="350px"
                >
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-ocean-900/95 backdrop-blur-xl border border-white/10 p-5 rounded-2xl shadow-2xl text-slate-200"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="pr-4">
                        <div className="flex items-center gap-2 mb-1">
                          <AlertCircle className={`w-4 h-4 ${selectedHazard.severity === 'critical' ? 'text-neon-coral' :
                              selectedHazard.severity === 'high' ? 'text-orange-500' : 'text-yellow-400'
                            }`} />
                          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                            {selectedHazard.category_name}
                          </span>
                        </div>
                        <h3 className="font-display font-bold text-lg text-white leading-tight">
                          {selectedHazard.title}
                        </h3>
                      </div>

                      <div className={`px-2 py-1 rounded bg-ocean-950 border border-white/5 shadow-inner`}>
                        <span className={`text-[10px] font-bold uppercase ${selectedHazard.severity === 'critical' ? 'text-neon-coral' :
                            selectedHazard.severity === 'high' ? 'text-orange-500' : 'text-yellow-400'
                          }`}>{selectedHazard.severity}</span>
                      </div>
                    </div>

                    <p className="text-sm text-slate-300 leading-relaxed mb-5">
                      {selectedHazard.description}
                    </p>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-ocean-950/50 p-3 rounded-xl border border-white/5">
                        <span className="text-[10px] text-slate-500 uppercase tracking-widest block mb-1 font-semibold">Trust Score</span>
                        <div className="flex items-center gap-2">
                          <div className="w-full h-1.5 bg-ocean-800 rounded-full overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${selectedHazard.trust_score}%` }}
                              transition={{ duration: 1, delay: 0.2 }}
                              className="h-full bg-gradient-to-r from-neon-cyan to-neon-emerald"
                            />
                          </div>
                          <span className="font-display font-bold text-white text-sm">
                            {selectedHazard.trust_score.toFixed(0)}
                          </span>
                        </div>
                      </div>
                      <div className="bg-ocean-950/50 p-3 rounded-xl border border-white/5">
                        <span className="text-[10px] text-slate-500 uppercase tracking-widest block mb-1 font-semibold">Intel Source</span>
                        <span className="font-medium text-white text-xs capitalize truncate block">
                          {selectedHazard.source.replace('_', ' ')}
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between text-[10px] text-slate-400">
                      <span>Reporter: <span className="text-slate-200">{selectedHazard.reporter_name || 'Classified'}</span></span>
                      <span>{new Date(selectedHazard.reported_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </motion.div>
                </Popup>
              )}
            </Map>
          </motion.div>
        </div>
      </main>

      {/* Global CSS injected for specific mapbox overrides to fit the premium theme */}
      <style>{`
        .mapboxgl-popup-content {
          background: transparent !important;
          padding: 0 !important;
          box-shadow: none !important;
        }
        .mapboxgl-popup-tip {
          display: none !important;
        }
        .mapboxgl-ctrl-group {
          background: rgba(7, 44, 66, 0.8) !important;
          backdrop-filter: blur(10px) !important;
          border: 1px solid rgba(255,255,255,0.1) !important;
          border-radius: 12px !important;
          overflow: hidden !important;
        }
        .mapboxgl-ctrl-group button {
          border-bottom: 1px solid rgba(255,255,255,0.05) !important;
        }
        .mapboxgl-ctrl-icon {
          filter: invert(1) opacity(0.7) !important;
        }
        .mapboxgl-ctrl-group button:hover {
          background-color: rgba(255,255,255,0.1) !important;
        }
      `}</style>
    </div>
  );
}
