import { PlayerOptions } from "tone";

export const AUDIO_URL = "https://d3m8x313oqkwp.cloudfront.net/";

export const TRACKS: Track[] = [
  { filename: "blindinglights.mp3", title: "the weeknd - BLINDING LIGHTS" },
  { filename: "kanye.mp3", title: "kanye west - FLASHING LIGHTS" },
  { filename: "mitsiki.mp3", title: "mitski - MY LOVE MINE ALL MINE" },
  { filename: "stillwithyou.mp3", title: "to heny 💖" },
  { filename: "newperson.mp3", title: "tame impala - track 1" },
  { filename: "romantic.mp3", title: "yu yu hakusho - romantic" },
  { filename: "spacesong.mp3", title: "beach house - SPACE SONG" },
  { filename: "unforgettable.mp3", title: "french montana - UNFORGETTABLE" },
  { filename: "rapsnitches.mp3", title: "mf doom - RAP SNITCHES" },
  { filename: "hozier.mp3", title: "hozier - TAKE ME TO CHURCH" },
  { filename: "simpson.mp3", title: "simpsonwave 1994" },
  { filename: "resonance.mp3", title: "home - RESONANCEb" },
  { filename: "5tint.mp3", title: "travis scott - 5% TINT" },
  { filename: "twoofus.mp3", title: "bill withers - JUST THE TWO OF US" },
  { filename: "here.mp3", title: "alessia cara - HERE" },
  { filename: "sunflower.mp3", title: "post malone - SUNFLOWER" },
  { filename: "less.mp3", title: "tame impala - THE LESS I KNOW THE BETTER" },
  { filename: "dancin.mp3", title: "aaron smith - DANCIN" },
  { filename: "reflection.mp3", title: "mac de marco - CHAMBER OF REFLECTION" }
];

export const DEFAULT_AUDIO_SETTINGS: Partial<PlayerOptions> = {
  volume: -10,
  playbackRate: 0.75,
  loop: true,
}; 

export const DEFAULT_REVERB_SETTINGS: ReverbOptions  = {
  decay: 30,
  wet: 0.75,
  preDelay: 0.1,
};

