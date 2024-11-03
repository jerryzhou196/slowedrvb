import { useState, useCallback } from 'react';

export interface Track {
  name: string;
  file: string;
}

export interface UseTracksOutput {
  getRandomTrack: () => Track;
  getNextTrack: () => void;
}

/**
 * A custom hook that manages track selection and playback order
 * @returns {UseTracksOutput} Object containing functions to control track selection
 */
export const useTracks = (): UseTracksOutput => {
  const tracks: Track[] = [
    { name: "the weeknd - BLINDING LIGHTS", file: "blindinglights.mp3" },
    { name: "kanye west - FLASHING LIGHTS", file: "kanye.mp3" },
    { name: "mitski - MY LOVE MINE ALL MINE", file: "mitsiki.mp3" },
    { name: "to heny 💖", file: "stillwithyou.mp3" },
    { name: "tame impala - track 1", file: "newperson.mp3" },
    { name: "yu yu hakusho - romantic", file: "romantic.mp3" },
    { name: "beach house - SPACE SONG", file: "spacesong.mp3" },
    { name: "french montana - UNFORGETTABLE", file: "unforgettable.mp3" },
    { name: "mf doom - RAP SNITCHES", file: "rapsnitches.mp3" },
    { name: "hozier - TAKE ME TO CHURCH", file: "hozier.mp3" },
    { name: "simpsonwave 1994", file: "simpson.mp3" },
    { name: "home - RESONANCEb", file: "resonance.mp3" },
    { name: "travis scott - 5% TINT", file: "5tint.mp3" },
    { name: "bill withers - JUST THE TWO OF US", file: "twoofus.mp3" },
    { name: "alessia cara - HERE", file: "here.mp3" },
    { name: "post malone - SUNFLOWER", file: "sunflower.mp3" },
    { name: "tame impala - THE LESS I KNOW THE BETTER", file: "less.mp3" },
    { name: "aaron smith - DANCIN", file: "dancin.mp3" },
  ];

  const [currentIndex, setCurrentIndex] = useState<number>(0);

  const getRandomTrack = useCallback((): Track => {
    const randomIndex = Math.floor(Math.random() * tracks.length);
    setCurrentIndex(randomIndex);
    return tracks[randomIndex];
  }, []);

  const getNextTrack = useCallback((): void => {
    const nextIndex = (currentIndex + 1) % tracks.length;
    setCurrentIndex(nextIndex);
  }, [currentIndex]);

  return { getRandomTrack, getNextTrack };
}; 
