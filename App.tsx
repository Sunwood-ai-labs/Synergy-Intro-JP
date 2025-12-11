/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState, useEffect, useRef } from 'react';
import { INTRO_STYLES, CUSTOM_STYLE, SUPPORTED_LANGUAGES } from './constants';
import { IntroStyle } from './types';
import { ALL_VOICES } from './voices';
import { StyleSelector } from './components/StyleSelector';
import { BauhausButton, getColorClass, DownloadIcon } from './components/BauhausComponents';
import { ConfigurationModal } from './components/ConfigurationModal';
import { SystemPromptModal } from './components/SystemPromptModal';
import { generateSpeech, createWavBlob, dramatizeText } from './services/geminiService';

const Footer: React.FC<{ className?: string }> = ({ className }) => (
  <div className={`p-4 border-t-4 border-bauhaus-black bg-white text-[8px] text-gray-500 font-bold uppercase tracking-wider ${className}`}>
    作成者 <a href="https://x.com/leslienooteboom" target="_blank" rel="noopener noreferrer" className="underline hover:text-bauhaus-red transition-colors">@leslienooteboom</a>
  </div>
);

// Helper to convert country code to flag emoji
const getFlagEmoji = (countryCode: string) => {
  if (!countryCode || countryCode.length !== 2 || !/^[A-Z]+$/.test(countryCode.toUpperCase())) {
    return '🌐';
  }
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char =>  127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
};

const App: React.FC = () => {
  const [currentStyle, setCurrentStyle] = useState<IntroStyle>(INTRO_STYLES[0]);
  const [text, setText] = useState<string>(INTRO_STYLES[0].templateText);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isPromptOpen, setIsPromptOpen] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState<string>(INTRO_STYLES[0].defaultVoice);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDramatizing, setIsDramatizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadData, setDownloadData] = useState<{ url: string, filename: string } | null>(null);
  const [flagIndex, setFlagIndex] = useState(0);

  // Auto-scroll state for languages
  const [isHoveringLang, setIsHoveringLang] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Custom State initialized from constants.ts to match description
  const [customStylePrompt, setCustomStylePrompt] = useState<string>(CUSTOM_STYLE.description);

  // Audio Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioElemRef = useRef<HTMLAudioElement | null>(null);
  
  // Generation Ref to handle cancellation
  const generationIdRef = useRef(0);

  // Cycle flags
  useEffect(() => {
    const interval = setInterval(() => {
      setFlagIndex((prev) => (prev + 1) % SUPPORTED_LANGUAGES.length);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll logic for languages
  useEffect(() => {
    let animationFrameId: number;
    let lastTime = 0;
    const speed = 25; // pixels per second

    const animate = (time: number) => {
      if (!lastTime) lastTime = time;
      const delta = time - lastTime;
      lastTime = time;

      const container = scrollContainerRef.current;
      if (container && !isHoveringLang) {
        // Increment scroll
        container.scrollTop += (speed * delta) / 1000;

        // Check for loop (assuming duplications)
        // We use scrollHeight / 2 as the loop point
        if (container.scrollTop >= container.scrollHeight / 2) {
           container.scrollTop = 0;
        }
      }

      animationFrameId = requestAnimationFrame(animate);
    };

    animationFrameId = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(animationFrameId);
  }, [isHoveringLang]);


  // Clear download data when voice changes to ensure regeneration/replay logic is correct
  useEffect(() => {
    setDownloadData(null);
  }, [selectedVoice]);

  // Update text and default voice when style changes
  const handleStyleChange = (style: IntroStyle) => {
    setCurrentStyle(style);
    setText(style.templateText);
    setSelectedVoice(style.defaultVoice);
    setError(null);
    setDownloadData(null); // Clear download on style change
  };

  const handleCustomize = () => {
    setCurrentStyle(CUSTOM_STYLE);
    setText(CUSTOM_STYLE.templateText);
    setError(null);
    setDownloadData(null);
    // Ensure we have a valid custom state, falling back to description
    if (!customStylePrompt) setCustomStylePrompt(CUSTOM_STYLE.description);
  };

  const handleStop = () => {
    // Stop Web Audio API Source
    if (sourceRef.current) {
      sourceRef.current.stop();
      sourceRef.current = null;
    }
    // Stop HTML5 Audio Element
    if (audioElemRef.current) {
      audioElemRef.current.pause();
      audioElemRef.current.currentTime = 0;
      audioElemRef.current = null;
    }
    setIsPlaying(false);
  };

  const getStylePrompt = () => {
    return currentStyle.id === 'custom' ? customStylePrompt : currentStyle.description;
  };

  const handleDramatize = async () => {
    if (!text.trim()) return;
    setIsDramatizing(true);
    setError(null);
    try {
      // If custom, pass the specific prompts. If preset, pass the description.
      const stylePrompt = getStylePrompt();

      const dramaticText = await dramatizeText(text, stylePrompt);
      setText(dramaticText);
      setDownloadData(null); // Invalidate current audio since text changed
    } catch (err) {
      console.error(err);
      setError("テキストの演出に失敗しました。もう一度お試しください。");
    } finally {
      setIsDramatizing(false);
    }
  };

  const handlePlay = async () => {
    // Case 1: Stop Playing
    if (isPlaying) {
      handleStop();
      return;
    }

    // Case 2: Stop Generation
    if (isGenerating) {
        setIsGenerating(false);
        generationIdRef.current += 1; // Invalidate current generation
        return;
    }

    // Case 3: Replay Existing
    if (downloadData && text.trim()) {
      try {
        const audio = new Audio(downloadData.url);
        audioElemRef.current = audio;
        setIsPlaying(true);
        audio.onended = () => {
            setIsPlaying(false);
            audioElemRef.current = null;
        };
        await audio.play();
        return;
      } catch (e) {
        console.warn("Replay failed, falling back to generation", e);
        setDownloadData(null);
        // Fall through to generation
      }
    }

    // Case 4: Start Generation / Preloaded
    if (!text.trim()) return;
    
    setIsGenerating(true);
    setError(null);
    setDownloadData(null);

    // Increment generation ID and capture it
    const currentGenId = ++generationIdRef.current;

    // Initialize Audio Context if needed
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    const ctx = audioContextRef.current;

    try {
      // Determine if we should use pre-loaded audio
      const isTemplateText = text.trim() === currentStyle.templateText.trim();
      const isDefaultVoice = selectedVoice === currentStyle.defaultVoice;
      const shouldUsePreloaded = isTemplateText && isDefaultVoice && currentStyle.audioSrc && currentStyle.id !== 'custom';

      if (shouldUsePreloaded && currentStyle.audioSrc) {
        try {
          // Attempt to play using HTML5 Audio element to bypass strict CORS on fetch
          // We wrap in a promise to handle the initial load/play failure
          await new Promise<void>((resolve, reject) => {
            if (currentGenId !== generationIdRef.current) {
                reject(new Error("Cancelled"));
                return;
            }

            const audio = new Audio(currentStyle.audioSrc);
            
            audio.play()
              .then(() => {
                if (currentGenId !== generationIdRef.current) {
                    audio.pause();
                    return;
                }

                audioElemRef.current = audio;
                setIsPlaying(true);
                audio.onended = () => {
                   setIsPlaying(false);
                   audioElemRef.current = null;
                };
                
                setDownloadData({
                  url: currentStyle.audioSrc!,
                  filename: `synergy-intro-${currentStyle.id}.wav`
                });
                
                resolve();
              })
              .catch((e) => {
                reject(e);
              });
          });
          
          // If we successfully started playing pre-loaded audio, we are done.
          if (currentGenId === generationIdRef.current) {
              setIsGenerating(false);
          }
          return;

        } catch (preloadError) {
          if (currentGenId !== generationIdRef.current) {
               setIsGenerating(false);
               return; // Was cancelled
          }
          console.warn("Failed to play pre-loaded audio, falling back to generation:", preloadError);
          // Fall through to generation logic below
        }
      }

      // --- GENERATION LOGIC ---
      const styleInstruction = getStylePrompt();
      const result = await generateSpeech(text, selectedVoice, styleInstruction);
      
      // Check cancellation after await
      if (currentGenId !== generationIdRef.current) {
          return;
      }

      const audioBuffer = result.buffer;
      const blob = createWavBlob(result.rawData);

      // Prepare Download Link
      const url = URL.createObjectURL(blob);
      setDownloadData({
        url,
        filename: `synergy-intro-${currentStyle.id}-${Date.now()}.wav`
      });
      
      setIsGenerating(false);
      setIsPlaying(true);
      
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      sourceRef.current = source;
      
      source.onended = () => {
        setIsPlaying(false);
        sourceRef.current = null;
      };

      source.start();

    } catch (err) {
      if (currentGenId !== generationIdRef.current) {
          // Cancelled, ignore error
          setIsGenerating(false);
          return;
      }
      console.error(err);
      setError("音声の生成に失敗しました。APIキーまたはネットワークを確認してください。");
      setIsGenerating(false);
      setIsPlaying(false);
    }
  };

  const handleDownload = async () => {
    if (!downloadData) return;

    try {
      let urlToDownload = downloadData.url;
      let needsRevoke = false;

      // If it's a remote URL (pre-loaded examples), fetch it as a blob to force download
      // instead of navigating to the file.
      if (urlToDownload.startsWith('http')) {
        const response = await fetch(urlToDownload);
        const blob = await response.blob();
        urlToDownload = URL.createObjectURL(blob);
        needsRevoke = true;
      }

      const a = document.createElement('a');
      a.href = urlToDownload;
      a.download = downloadData.filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      if (needsRevoke) {
        setTimeout(() => URL.revokeObjectURL(urlToDownload), 100);
      }
    } catch (err) {
      console.error("Download failed, falling back to open:", err);
      // Fallback for CORS errors or network issues
      const a = document.createElement('a');
      a.href = downloadData.url;
      a.target = '_blank';
      a.click();
    }
  };

  // Cleanup object URLs
  useEffect(() => {
    return () => {
      // Only revoke blob URLs, not remote http URLs
      if (downloadData && downloadData.url.startsWith('blob:')) {
        URL.revokeObjectURL(downloadData.url);
      }
    };
  }, [downloadData]);

  const activeVoiceData = ALL_VOICES.find(v => v.name === selectedVoice);
  const activeVoiceLabel = activeVoiceData ? activeVoiceData.name : selectedVoice;

  const showDramatize = text.trim() !== currentStyle.templateText.trim();
  const promptText = getStylePrompt();
  const promptPreview = promptText.replace(/\n/g, ' ').slice(0, 50);

  const isCustomMode = currentStyle.id === 'custom';

  return (
    <div className="flex flex-col md:flex-row bg-bauhaus-white font-sans text-bauhaus-black h-screen w-full overflow-hidden">
      <style>{`
        /* Hide scrollbar for Chrome, Safari and Opera */
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        /* Hide scrollbar for IE, Edge and Firefox */
        .no-scrollbar {
          -ms-overflow-style: none;  /* IE and Edge */
          scrollbar-width: none;  /* Firefox */
        }
        
        /* Show scrollbar on hover */
        .hover-scrollbar:hover::-webkit-scrollbar {
          display: block;
          width: 8px;
        }
        .hover-scrollbar:hover::-webkit-scrollbar-track {
           background: #F4F4F0;
        }
        .hover-scrollbar:hover::-webkit-scrollbar-thumb {
           background: #1A1A1A;
           border-radius: 4px;
        }
        .hover-scrollbar:hover {
          scrollbar-width: thin;
        }
      `}</style>
      
      {/* Sidebar - Style Selector */}
      {/* Reduced height on mobile to 180px */}
      <div className="w-full md:w-1/4 md:min-w-[300px] h-[180px] md:h-full flex-shrink-0 border-b-4 md:border-b-0 md:border-r-4 border-bauhaus-black z-10 flex flex-col bg-bauhaus-white">
        <div className="flex-1 min-h-0 relative">
          <StyleSelector 
            selectedStyle={currentStyle} 
            onSelect={handleStyleChange}
            onCustomize={handleCustomize}
          />
        </div>
        {/* Desktop Footer in Sidebar */}
        <Footer className="hidden md:block" />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full relative min-w-0 overflow-hidden">
        
        {/* Header / Title Area */}
        {/* Compact padding on mobile (p-3) */}
        <div className="flex-shrink-0 border-b-4 border-bauhaus-black p-3 md:p-8 bg-white flex justify-between items-start z-10">
          <div>
            <h1 className="text-2xl md:text-4xl lg:text-6xl font-black uppercase tracking-tighter mb-1 md:mb-2">
              Synergy Intro JP
            </h1>
            <div className="flex items-center gap-3">
              <span className={`px-2 py-0.5 md:px-3 md:py-1 text-[10px] md:text-sm font-bold uppercase text-white ${getColorClass(currentStyle.color, true)}`}>
                {isCustomMode ? 'カスタム設定' : '現在のスタイル'}
              </span>
              <span className="font-bold uppercase tracking-widest text-xs md:text-base">{currentStyle.name}</span>
            </div>
          </div>

          {/* Description Text - Hide on small screens completely or keep minimal */}
          <div className="hidden md:block text-right">
            <p className="text-sm font-bold uppercase tracking-wide leading-tight">会議の雰囲気を一変させる</p>
            <p className="text-xs font-bold uppercase tracking-wide leading-tight text-gray-500 mt-1">Geminiの音声合成で期待感を高めよう</p>
          </div>
        </div>

        {/* Text Input Area */}
        {/* Ensure flex-1 and min-h-0 to force scrolling inside */}
        <div className="flex-1 p-3 md:p-8 bg-bauhaus-white relative flex flex-col min-h-0">
          <div className="flex flex-col h-full">
            
            <div className="flex flex-col md:flex-row justify-between md:items-center gap-x-4 gap-y-2 mb-2 md:mb-4 flex-shrink-0 z-30 relative">
              
              {/* Prompt Preview Bar (Replacing Header) */}
              <button
                 onClick={() => setIsPromptOpen(true)}
                 className={`
                    flex-1 min-w-0 text-left px-3 py-2 border-2 border-dashed transition-all group flex items-center gap-2 w-full md:w-auto
                    ${isCustomMode 
                        ? 'bg-bauhaus-white border-bauhaus-black hover:bg-bauhaus-yellow' 
                        : 'bg-gray-100 border-gray-300 hover:border-bauhaus-black hover:bg-bauhaus-yellow hover:border-solid'
                    }
                 `}
                 title={isCustomMode ? "カスタムスタイルとボイスを設定" : "システムプロンプト全体を表示"}
              >
                 <span className={`text-[10px] font-bold uppercase text-white px-1.5 py-0.5 rounded-sm flex-shrink-0 ${isCustomMode ? 'bg-bauhaus-red' : 'bg-bauhaus-black'}`}>
                    {isCustomMode ? 'スタイル設定' : 'システムプロンプト'}
                 </span>
                 <span className="font-mono text-xs text-gray-600 group-hover:text-bauhaus-black truncate flex-1">
                   {promptPreview}...
                 </span>
                 <span className="text-[10px] font-bold uppercase text-gray-400 group-hover:text-bauhaus-black whitespace-nowrap hidden lg:inline flex-shrink-0">
                    {isCustomMode ? 'クリックして編集' : 'クリックして展開'}
                 </span>
              </button>

              <div className="flex items-center gap-3 flex-shrink-0 self-end md:self-auto ml-auto md:ml-0">
                {/* Language Badge Button */}
                <button 
                    type="button"
                    className="relative group cursor-help z-50 text-left focus:outline-none"
                    aria-label="対応言語を表示"
                >
                    <div className="flex items-center gap-2 py-2">
                        <span className="text-xs font-bold uppercase hidden sm:inline text-gray-500">対応言語</span>
                        <span className="text-xs font-bold uppercase sm:hidden text-gray-500">言語</span>
                        <span className="text-base">{getFlagEmoji(SUPPORTED_LANGUAGES[flagIndex].code.split('-')[1])}</span>
                    </div>
                    
                    {/* Hover/Focus Popup */}
                    <div className={`absolute top-full pt-1 w-64 opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto group-focus:pointer-events-auto z-50 ${showDramatize ? 'left-0 sm:left-auto sm:right-0' : 'right-0'}`}>
                         <div className="bg-bauhaus-white border-4 border-bauhaus-black shadow-hard-sm flex flex-col h-[300px] relative">
                             
                             <div 
                               className="h-full bg-white relative overflow-y-auto no-scrollbar hover-scrollbar"
                               ref={scrollContainerRef}
                               onMouseEnter={() => setIsHoveringLang(true)}
                               onMouseLeave={() => setIsHoveringLang(false)}
                               onTouchStart={() => setIsHoveringLang(true)}
                               onTouchEnd={() => { setTimeout(() => setIsHoveringLang(false), 2000) }}
                             >
                                <div className="flex flex-col gap-2 p-2 pb-2">
                                    {SUPPORTED_LANGUAGES.map((lang) => (
                                        <div key={`orig-${lang.code}`} className="flex items-center gap-2 text-xs font-bold text-bauhaus-black flex-shrink-0">
                                            <span className="text-lg w-6 text-center">{getFlagEmoji(lang.code.split('-')[1])}</span>
                                            <span>{lang.name}</span>
                                        </div>
                                    ))}
                                </div>
                                <div className="flex flex-col gap-2 p-2 pb-2">
                                    {SUPPORTED_LANGUAGES.map((lang) => (
                                        <div key={`dup-${lang.code}`} className="flex items-center gap-2 text-xs font-bold text-bauhaus-black flex-shrink-0">
                                            <span className="text-lg w-6 text-center">{getFlagEmoji(lang.code.split('-')[1])}</span>
                                            <span>{lang.name}</span>
                                        </div>
                                    ))}
                                </div>
                             </div>
                             
                             {/* Gradient masks */}
                             <div className="absolute top-0 left-0 right-0 h-4 bg-gradient-to-b from-white to-transparent pointer-events-none z-10"></div>
                             <div className="absolute bottom-0 left-0 right-0 h-4 bg-gradient-to-t from-white to-transparent pointer-events-none z-10"></div>
                        </div>
                    </div>
                </button>
              
                {showDramatize && (
                  <button
                    onClick={handleDramatize}
                    disabled={isDramatizing || !text.trim()}
                    className={`
                      flex items-center gap-2 text-[10px] md:text-sm font-bold uppercase border-2 border-bauhaus-black px-2 py-1 md:px-3 md:py-1.5 transition-all
                      focus:outline-none focus:ring-4 focus:ring-bauhaus-yellow
                      ${isDramatizing 
                        ? 'bg-gray-200 text-gray-500 cursor-wait shadow-none' 
                        : 'bg-white text-bauhaus-black shadow-[2px_2px_0px_0px_#1A1A1A] hover:-translate-y-0.5 hover:shadow-[3px_3px_0px_0px_#1A1A1A] active:translate-y-0 active:shadow-[1px_1px_0px_0px_#1A1A1A]'
                      }
                    `}
                  >
                    {isDramatizing ? (
                      <span className="animate-pulse">演出中...</span>
                    ) : (
                      <>
                        <span>✨ 演出を加える</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

            <div className="relative flex-1 min-h-[100px] shadow-hard bg-white border-4 border-bauhaus-black transition-all hover:-translate-y-1 mb-2">
              <textarea 
                className="w-full h-full resize-none p-4 md:p-6 text-lg md:text-3xl font-bold bg-transparent outline-none placeholder-gray-300 leading-normal focus:bg-gray-50"
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setDownloadData(null); // Clear download if text changes
                }}
                placeholder="会議の導入文をここに入力してください..."
              />
              <div className="absolute bottom-4 right-4 text-[10px] md:text-xs font-bold bg-bauhaus-black text-white px-2 py-1 pointer-events-none">
                {text.length} 文字
              </div>
            </div>
            
            {error && (
              <div className="flex-shrink-0 mt-4 p-4 bg-bauhaus-red text-white font-bold border-4 border-bauhaus-black">
                エラー: {error}
              </div>
            )}
          </div>
        </div>

        {/* Action Bar */}
        <div className="flex-shrink-0 border-t-4 border-bauhaus-black bg-white p-3 md:p-8 z-20">
          <div className="flex items-center justify-between relative">
            
            {/* Left Side Container - Grows to push center */}
            <div className="flex-1 flex justify-start min-w-0 pr-2">
              <BauhausButton 
                onClick={handleDownload}
                disabled={!downloadData || text.trim() === currentStyle.templateText.trim()}
                variant="primary"
                icon={<DownloadIcon className="w-5 h-5 md:w-6 md:h-6" />}
                className="text-sm md:text-lg p-3 md:p-4 whitespace-nowrap focus:outline-none focus:ring-4 focus:ring-bauhaus-black"
              >
                <span className="hidden lg:inline">ダウンロード</span>
              </BauhausButton>
            </div>

            {/* Center Container - Play Button */}
            <div className="flex flex-col items-center justify-center flex-shrink-0 z-10 group">
              <button 
                onClick={handlePlay}
                disabled={isDramatizing}
                className={`
                  w-14 h-14 md:w-24 md:h-24 rounded-full border-4 border-bauhaus-black flex items-center justify-center transition-all shadow-hard
                  focus:outline-none focus:ring-4 focus:ring-bauhaus-yellow
                  ${(isPlaying || isGenerating) ? 'bg-bauhaus-black hover:bg-gray-800' : 'bg-bauhaus-red hover:bg-red-600 hover:-translate-y-1'}
                  ${isGenerating ? 'hover:translate-y-2 hover:shadow-none' : ''}
                `}
                aria-label={isGenerating ? "音声生成を停止" : isPlaying ? "再生を停止" : "音声を生成して再生"}
              >
                {isGenerating ? (
                   <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 md:w-2 md:h-2 bg-white animate-pulse"></div>
                    <div className="w-1.5 h-1.5 md:w-2 md:h-2 bg-white animate-pulse delay-75"></div>
                    <div className="w-1.5 h-1.5 md:w-2 md:h-2 bg-white animate-pulse delay-150"></div>
                  </div>
                ) : isPlaying ? (
                  <div className="w-5 h-5 md:w-8 md:h-8 bg-white"></div> /* Stop Icon */
                ) : (
                  <div className="w-0 h-0 border-t-[8px] md:border-t-[15px] border-t-transparent border-l-[14px] md:border-l-[25px] border-l-white border-b-[8px] md:border-b-[15px] border-b-transparent ml-1 md:ml-2"></div> /* Play Icon */
                )}
              </button>
              <span className="font-bold mt-4 uppercase tracking-widest text-[10px] md:text-base whitespace-nowrap">
                {isGenerating ? (
                   <>
                     <span className="group-hover:hidden">生成中...</span>
                     <span className="hidden group-hover:inline">生成を停止</span>
                   </>
                ) : isPlaying ? '停止' : '再生'}
              </span>
            </div>

            {/* Right Side Container - Grows to balance Left */}
            <div className="flex-1 flex flex-col items-end justify-center min-w-0 pl-2">
               <div className="text-[10px] md:text-xs font-bold uppercase text-gray-500 mb-1 whitespace-nowrap">使用ボイス</div>
               {/* Change div to button for accessibility */}
               <button 
                 type="button"
                 className={`
                   text-xs md:text-lg font-bold border-2 px-2 md:px-3 py-1 text-right transition-colors max-w-full truncate
                   focus:outline-none focus:ring-4 focus:ring-bauhaus-yellow
                   ${currentStyle.id === 'custom' 
                     ? 'bg-bauhaus-yellow border-bauhaus-black text-bauhaus-black' 
                     : 'bg-bauhaus-black border-bauhaus-black text-white cursor-pointer hover:bg-gray-800'
                   }
                 `}
                 onClick={() => setIsConfigOpen(true)}
                 title={"ボイス設定をクリック"}
                 aria-label={`現在のボイス: ${activeVoiceLabel}. クリックして変更.`}
               >
                 {activeVoiceLabel}
               </button>
            </div>

          </div>
        </div>

        {/* Mobile Footer in Main Content */}
        <Footer className="md:hidden flex-shrink-0" />

      </div>

      {/* Modals */}
      <ConfigurationModal 
        isOpen={isConfigOpen} 
        onClose={() => setIsConfigOpen(false)}
        selectedVoice={selectedVoice}
        onVoiceChange={setSelectedVoice}
      />
      
      <SystemPromptModal
        isOpen={isPromptOpen}
        onClose={() => setIsPromptOpen(false)}
        prompt={promptText}
        isEditable={isCustomMode}
        currentVoice={selectedVoice}
        onSave={(newPrompt, newVoice) => {
            setCustomStylePrompt(newPrompt);
            if (newVoice) setSelectedVoice(newVoice);
            setDownloadData(null);
        }}
      />
    </div>
  );
};

export default App;