import { useState, useRef, useEffect, useCallback } from 'react'

import heroVideo1 from '@/assets/hero-video-1.mp4'
import heroVideo2 from '@/assets/hero-video-2.mp4'
import heroVideo3 from '@/assets/hero-video-3.mp4'
import heroVideo4 from '@/assets/hero-video-4.mp4'

const VIDEO_SOURCES = [heroVideo4, heroVideo3, heroVideo2, heroVideo1]

const CROSSFADE_DURATION = 1200
const END_THRESHOLD = 0.5

export function HeroVideoCarousel() {
  const videoARef = useRef<HTMLVideoElement>(null)
  const videoBRef = useRef<HTMLVideoElement>(null)
  const [activeSlot, setActiveSlot] = useState<'A' | 'B'>('A')
  const [currentIndex, setCurrentIndex] = useState(0)
  const crossfadeTriggeredRef = useRef(false)

  const getNextIndex = useCallback(
    (idx: number) => (idx + 1) % VIDEO_SOURCES.length,
    []
  )

  useEffect(() => {
    if (videoARef.current) {
      videoARef.current.src = VIDEO_SOURCES[0]
      videoARef.current.load()
    }
    if (videoBRef.current && VIDEO_SOURCES.length > 1) {
      videoBRef.current.src = VIDEO_SOURCES[getNextIndex(0)]
      videoBRef.current.load()
    }
  }, [getNextIndex])

  // Autoplay with mobile fallbacks
  useEffect(() => {
    const activeVideo = activeSlot === 'A' ? videoARef.current : videoBRef.current
    if (!activeVideo) return

    const tryPlay = () => {
      activeVideo.muted = true
      activeVideo.volume = 0
      const p = activeVideo.play()
      if (p) p.catch(() => {})
    }

    tryPlay()

    const handleInteraction = () => {
      tryPlay()
      document.removeEventListener('touchstart', handleInteraction)
      document.removeEventListener('click', handleInteraction)
    }
    document.addEventListener('touchstart', handleInteraction, { once: true })
    document.addEventListener('click', handleInteraction, { once: true })

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) tryPlay()
      },
      { threshold: 0.25 }
    )
    observer.observe(activeVideo)

    return () => {
      observer.disconnect()
      document.removeEventListener('touchstart', handleInteraction)
      document.removeEventListener('click', handleInteraction)
    }
  }, [activeSlot])

  // Crossfade logic
  useEffect(() => {
    if (VIDEO_SOURCES.length <= 1) return

    const activeVideo = activeSlot === 'A' ? videoARef.current : videoBRef.current
    const inactiveVideo = activeSlot === 'A' ? videoBRef.current : videoARef.current
    if (!activeVideo || !inactiveVideo) return

    crossfadeTriggeredRef.current = false

    const handleTimeUpdate = () => {
      if (crossfadeTriggeredRef.current) return
      const remaining = activeVideo.duration - activeVideo.currentTime
      if (remaining <= END_THRESHOLD && activeVideo.duration > 0) {
        crossfadeTriggeredRef.current = true

        const nextIdx = getNextIndex(currentIndex)
        inactiveVideo.src = VIDEO_SOURCES[nextIdx]
        inactiveVideo.load()
        inactiveVideo.muted = true
        inactiveVideo.volume = 0
        const p = inactiveVideo.play()
        if (p) p.catch(() => {})

        setActiveSlot((prev) => (prev === 'A' ? 'B' : 'A'))
        setCurrentIndex(nextIdx)
      }
    }

    activeVideo.addEventListener('timeupdate', handleTimeUpdate)
    return () => activeVideo.removeEventListener('timeupdate', handleTimeUpdate)
  }, [activeSlot, currentIndex, getNextIndex])

  return (
    <>
      <video
        ref={videoARef}
        className="absolute inset-0 w-full h-full object-cover"
        style={{
          opacity: activeSlot === 'A' ? 1 : 0,
          transition: `opacity ${CROSSFADE_DURATION}ms ease-in-out`,
          zIndex: activeSlot === 'A' ? 2 : 1,
          pointerEvents: 'none',
        }}
        muted
        playsInline
        preload="auto"
      />

      <video
        ref={videoBRef}
        className="absolute inset-0 w-full h-full object-cover"
        style={{
          opacity: activeSlot === 'B' ? 1 : 0,
          transition: `opacity ${CROSSFADE_DURATION}ms ease-in-out`,
          zIndex: activeSlot === 'B' ? 2 : 1,
          pointerEvents: 'none',
        }}
        muted
        playsInline
        preload="auto"
      />

      <div
        className="absolute inset-0 bg-black/60"
        style={{ zIndex: 10, pointerEvents: 'none' }}
      />

      <style>{`
        video::-webkit-media-controls,
        video::-webkit-media-controls-panel,
        video::-webkit-media-controls-play-button,
        video::-webkit-media-controls-start-playback-button,
        video::-webkit-media-controls-enclosure {
          display: none !important;
          -webkit-appearance: none !important;
          opacity: 0 !important;
          pointer-events: none !important;
        }
      `}</style>
    </>
  )
}
