import { useRef, useEffect, useCallback, useState } from 'react'

import heroVideo1 from '@/assets/hero-video-1.mp4'
import heroVideo2 from '@/assets/hero-video-2.mp4'
import heroVideo3 from '@/assets/hero-video-3.mp4'
import heroVideo4 from '@/assets/hero-video-4.mp4'

const VIDEO_SOURCES = [heroVideo4, heroVideo3, heroVideo2, heroVideo1]

const CROSSFADE_DURATION = 1200
const END_THRESHOLD = 0.5
const PREBUFFER_THRESHOLD = 3 // seconds before end to start loading next

export function HeroVideoCarousel() {
  const videoARef = useRef<HTMLVideoElement>(null)
  const videoBRef = useRef<HTMLVideoElement>(null)
  const [activeSlot, setActiveSlot] = useState<'A' | 'B'>('A')
  const currentIndexRef = useRef(0)
  const crossfadeTriggeredRef = useRef(false)
  const prebufferedRef = useRef(false)

  const getNextIndex = useCallback(
    (idx: number) => (idx + 1) % VIDEO_SOURCES.length,
    []
  )

  const getActiveVideo = useCallback(() => {
    return activeSlot === 'A' ? videoARef.current : videoBRef.current
  }, [activeSlot])

  const getInactiveVideo = useCallback(() => {
    return activeSlot === 'A' ? videoBRef.current : videoARef.current
  }, [activeSlot])

  // Initial setup: load first video into slot A, prebuffer second into slot B
  useEffect(() => {
    const videoA = videoARef.current
    const videoB = videoBRef.current
    if (!videoA) return

    videoA.src = VIDEO_SOURCES[0]
    videoA.load()
    videoA.muted = true
    videoA.volume = 0

    if (videoB && VIDEO_SOURCES.length > 1) {
      videoB.src = VIDEO_SOURCES[getNextIndex(0)]
      videoB.load()
      videoB.muted = true
      videoB.volume = 0
    }
  }, [getNextIndex])

  // Autoplay active video with mobile fallbacks
  useEffect(() => {
    const activeVideo = getActiveVideo()
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
  }, [activeSlot, getActiveVideo])

  // Crossfade: prebuffer next video early, then swap slots near end
  useEffect(() => {
    if (VIDEO_SOURCES.length <= 1) {
      // Single video: just loop it
      const video = videoARef.current
      if (video) video.loop = true
      return
    }

    const activeVideo = getActiveVideo()
    const inactiveVideo = getInactiveVideo()
    if (!activeVideo || !inactiveVideo) return

    crossfadeTriggeredRef.current = false
    prebufferedRef.current = false

    const handleTimeUpdate = () => {
      if (!activeVideo.duration || activeVideo.duration === 0) return
      const remaining = activeVideo.duration - activeVideo.currentTime

      // Prebuffer: load next video source well before crossfade
      if (!prebufferedRef.current && remaining <= PREBUFFER_THRESHOLD) {
        prebufferedRef.current = true
        const nextIdx = getNextIndex(currentIndexRef.current)
        // Only reload if src changed
        const nextSrc = VIDEO_SOURCES[nextIdx]
        if (!inactiveVideo.src.endsWith(nextSrc.split('/').pop() || '')) {
          inactiveVideo.src = nextSrc
          inactiveVideo.load()
        }
        inactiveVideo.muted = true
        inactiveVideo.volume = 0
        inactiveVideo.currentTime = 0
      }

      // Crossfade trigger
      if (!crossfadeTriggeredRef.current && remaining <= END_THRESHOLD) {
        crossfadeTriggeredRef.current = true

        // Start playing the prebuffered inactive video
        const p = inactiveVideo.play()
        if (p) p.catch(() => {})

        const nextIdx = getNextIndex(currentIndexRef.current)
        currentIndexRef.current = nextIdx

        // Swap active slot — CSS transition handles the fade
        setActiveSlot((prev) => (prev === 'A' ? 'B' : 'A'))
      }
    }

    activeVideo.addEventListener('timeupdate', handleTimeUpdate)
    return () => activeVideo.removeEventListener('timeupdate', handleTimeUpdate)
  }, [activeSlot, getActiveVideo, getInactiveVideo, getNextIndex])

  // After crossfade completes, prebuffer the NEXT next video into the now-inactive slot
  useEffect(() => {
    if (VIDEO_SOURCES.length <= 2) return

    const timeout = setTimeout(() => {
      const inactiveVideo = getInactiveVideo()
      if (!inactiveVideo) return
      const nextNextIdx = getNextIndex(getNextIndex(currentIndexRef.current - 1 < 0 ? VIDEO_SOURCES.length - 1 : currentIndexRef.current - 1))
      // Don't reload if it's already loaded
      const src = VIDEO_SOURCES[nextNextIdx]
      if (!inactiveVideo.src.endsWith(src.split('/').pop() || '')) {
        inactiveVideo.src = src
        inactiveVideo.load()
        inactiveVideo.muted = true
        inactiveVideo.volume = 0
      }
    }, CROSSFADE_DURATION + 500)

    return () => clearTimeout(timeout)
  }, [activeSlot, getInactiveVideo, getNextIndex])

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
