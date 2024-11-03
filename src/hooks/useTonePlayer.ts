import {
  useCallback,
  useEffect,
  useRef,
  useState,
  MutableRefObject,
} from "react";

import * as Tone from "tone";

import { unmute } from "../unmute";

// Custom hook to manage Tone.js player instance
export const useTonePlayer = (
  audioUrl: string,
  reverbWetness: number,
  speed: number
) => {
  const playerRef: React.MutableRefObject<Tone.Player | null> = useRef(null);
  const reverbRef: React.MutableRefObject<Tone.Reverb | null> = useRef(null);

  const [isLoaded, setIsLoaded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  // Initialize player once
  useEffect(() => {
    // Clean up previous player if it exists
    return () => {
      if (playerRef.current) {
        playerRef.current.stop();
        playerRef.current.dispose();
      }
    };
  }, []); // Empty dependency array ensures this only runs once

  // Load audio when URL changes
  useEffect(() => {
    const loadAudio = async () => {
      // Only create new player if we don't have one or URL changed
      if (!playerRef.current) {
        playerRef.current = new Tone.Player({
          autostart: false,
          loop: true,
          playbackRate: 1.5,
          fadeIn: 0.5,
          fadeOut: 0.5,
          volume: -6, // in decibels
          mute: false,
        }).toDestination();

        reverbRef.current = new Tone.Reverb({
          decay: 30,
          wet: reverbWetness,
          preDelay: 0.1,
        }).toDestination();
      } else {
        // If player exists, just load new URL
        setIsPlaying(false);
        setIsLoaded(false);
        if (audioUrl != "") {
          playerRef.current.stop();
          playerRef.current.load(audioUrl);
          playerRef.current.connect(reverbRef.current!);
          unmute(playerRef.current!.context.rawContext, true, false);
        }
        setIsLoaded(true);
      }
    };

    loadAudio();
  }, [audioUrl]);

  // Play control
  const togglePlay = useCallback(async () => {
    if (!playerRef.current || !reverbRef.current) return;

    // Ensure audio context is started (needed due to browser autoplay policies)
    if (!isPlaying) {
      playerRef.current.start();
      setIsPlaying(true);
    } else {
      playerRef.current.stop();
      setIsPlaying(false);
    }
  }, [isLoaded, isPlaying]);

  // Suppport Reverb Change
  const setReverb = useCallback(
    (wetness: number) => {
      if (reverbRef.current) {
        reverbRef.current.set({ wet: wetness });
      }
    },
    [reverbRef.current]
  );

  const setSpeed = (speed: number) => {
    if (playerRef.current) {
      playerRef.current.playbackRate = speed;
    }
  };

  return {
    isLoaded,
    isPlaying,
    togglePlay,
    setReverb,
    setSpeed,
  };
};
