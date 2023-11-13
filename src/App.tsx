import React, { useState, useCallback, useRef, FC, useEffect } from "react";
import "./App.css";
import VinylStick from "./resources/stick.svg";
import Pause from "./resources/pause.svg";
import Play from "./resources/play.svg";

import { useDropzone } from "react-dropzone";
import * as Tone from "tone";
import Slider from "@mui/material/Slider";

import { unmute } from './unmute'; // Adjust the path according to your file structure


const url = "https://d3m8x313oqkwp.cloudfront.net/"

let trackIndex: number = 0;
const tracks = [
  ["blindinglights.mp3", "the weeknd - BLINDING LIGHTS"],
  ["kanye.mp3", "kanye west - FLASHING LIGHTS"],
  ["mitsiki.mp3", "mitski - MY LOVE MINE ALL MINE"],
  ["stillwithyou.mp3", "to heny 💖"],
  ["newperson.mp3", "tame impala - track 1"],
  ["eventually.mp3", "tame impala - track 2"],
  ["romantic.mp3", "yu yu hakusho - romantic"],
  ["spacesong.mp3", "beach house - SPACE SONG"],
  ["unforgettable.mp3", "french montana - UNFORGETTABLE"],
  ["rapsnitches.mp3", "mf doom - RAP SNITCHES"],
];



const App: FC = () => {
    const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
    const [fileName, setFileName] = useState<String >("");
    const [player, setPlayer] = useState<Tone.Player | null>(null);
    const [reverb, setReverb] = useState<Tone.Reverb | null>(null);
    const [playing, setPlaying] = useState<Boolean>(false);

  


 const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
  stopMusic();
   if (event.target.files?.length) {
     const file = event.target.files[0];
     const blob = new Blob([file], { type: file.type });
     setFileName(file.name);
     setAudioBlob(blob);
     runPlayer(blob);
   }
 };

 const runPlayer = (blob: Blob) => {
   if (!player) {
     initializePlayer(blob);
   } else {
     changePlayerSong(blob, player);
   }
 };

 const changePlayerSong = (blob: Blob, player: Tone.Player) => {
  stopMusic();
   const newUrl = URL.createObjectURL(blob);
   player
     .load(newUrl)
     .then(() => {
       // Cleanup the URL object after stopping the player
       player.onstop = () => {
         URL.revokeObjectURL(newUrl);
       };
     })
     .catch((error) => {
       console.error("Error loading audio data:", error);
     });
 };

 const initializePlayer = (blob: Blob) => {
   // Use Tone.js to create a URL from the Blob
   const url = URL.createObjectURL(blob);
   const tempPlayer = new Tone.Player(
    {url, volume: -10, playbackRate: 0.75, loop: true}
    ).toDestination();
    unmute(tempPlayer.context.rawContext);
   // ... (reverb and player initialization remains unchanged)
   const reverb = new Tone.Reverb({
    decay: 30, 
    wet: 0.75,
    preDelay: 0.1,
   }).toDestination();

   tempPlayer.connect(reverb);
   setReverb(reverb);
   
   // Cleanup the URL object after stopping the player
   tempPlayer.onstop = () => {
     URL.revokeObjectURL(url);
   };

   setPlayer(tempPlayer);
 };


    
    

  const onDrop = useCallback((acceptedFiles: File[]) => {
    // handle file drop
    console.log(acceptedFiles);
  }, []);

  

  const { getRootProps, isDragActive } = useDropzone({
    onDrop,
    noClick: true,
    noKeyboard: true,
  });


  console.log(isDragActive);

  // Reference to the hidden file input element
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Function to trigger the file input when the button is clicked
  const onButtonClick = () => {
    fileInputRef.current?.click();
  };

  const { ref, ...rootProps } = getRootProps();

  const handleReverbChange = (event: Event, value: number | number[], activeThumb: number) => {
    if (typeof value == 'number'){
      if (reverb){
          const reverbDuplicate: Tone.Reverb = reverb;
          reverb.wet.value = value as any;
          setReverb(reverbDuplicate)
      }
    } else {
      console.log("why is reverb an array you idiot?");
    }
  }

    const handleSpeedChange = (event: Event, value: number[] | number, activeThumb: number) => {
      console.log("speed changed to", value);
      if (typeof value == "number") {
        if (player){
          const duplicatePlayer: Tone.Player = player;
          duplicatePlayer.playbackRate = value;
          setPlayer(duplicatePlayer);
          const spinSpeed = (1 / (value)) ;
          document.documentElement.style.setProperty('--rotation-duration', `${spinSpeed}s`);
        }
        
      } else {
        console.log("why is speed an array you idiot?");
      }
    };

    const stopMusic = () => {
      setPlaying(false);
      if (player) player.stop();
    }
    
    const handlePlaying = () => {
      if (player && playing){
        stopMusic();
        document.getElementById("#Disc")?.classList.remove("rotate")
      } else if (player && !playing){
        console.log("audioContext", player.context.rawContext);
        console.log("audioContext", Tone.getContext().rawContext);
        setPlaying(true);
        player.start();

        document.getElementById("Disc")?.classList.add("rotate");
      } else if (audioBlob) {
        runPlayer(audioBlob);
      }
    }

useEffect(() => {
  loadRandomSong();
  // eslint-disable-next-line react-hooks/exhaustive-deps
},[])
    
 const loadRandomSong = () => {
   // Fetch the array buffer of the randomly selected track
   stopMusic();
   const track = tracks[trackIndex % tracks.length];
   trackIndex += 1;

   // Define the cache name
   const cacheName = "track-cache";

   // Construct the full URL for the track
   const trackUrl = url + track[0];

   // Check the cache first, then network
   caches.open(cacheName).then((cache) => {
     cache
       .match(trackUrl)
       .then((cachedResponse) => {
         if (cachedResponse) {
           // If the track is in the cache, use it
           return cachedResponse.blob();
         } else {
           // Otherwise, fetch from the network and cache the response
           return fetch(trackUrl)
             .then((networkResponse) => {
               cache.put(trackUrl, networkResponse.clone());
               return networkResponse.blob();
             })
             .catch((error) => {
               console.error("Error loading track:", error);
             });
         }
       })
       .then((blob) => {
        if (blob){
                   // Play the track
         setAudioBlob(blob);
         setFileName(track[1]);
         if (player) {
           changePlayerSong(blob, player);
         } else {
           initializePlayer(blob);
         }

        }

       });
   });
 };
 



  return (
    <div className="App">
      <header className="header-label">
        <div className="header-label-container">
          <div className="header-label-subtitle"> a jerry zhou project</div>
          <div className="header-label-title"> slowedrvb.com </div >
        </div>
      </header>
      <div className="musicplayer-container">
        <div className="vinyl-player">
          <div style={{ width: "100%" }}>
            <div style={{ marginBottom: "1vw" }}>
              <button className="sauceMeUp" onClick={loadRandomSong}>
                <span className="sauceMeUp-text">sauce me up</span>
              </button>
              <button className="chooseFile" onClick={onButtonClick}>
                <span className="chooseFile-text">choose mp3 file</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                style={{ display: "none" }}
                onChange={(e) => handleFileChange(e)}
                accept="audio/mp3"
              />
              <div className="chooseFile-subtext">
                or drag it onto the
                <span style={{ color: "#D1D0C5" }}> disc </span>
              </div>
            </div>
          </div>
          <div
            {...rootProps}
            id="Disc"
            className={`Disc circle ${playing ? "rotate" : ""}`}
          >
            <div className="inner-disc circle">
              <span className="track-name"> {fileName}</span>
            </div>
          </div>
          <img src={VinylStick} alt="Vinyl Stick" className="stick" />
          <img
            id="playback"
            alt="Play Button"
            src={playing ? Pause : Play}
            onClick={handlePlaying}
            className="playback-button"
          />
        </div>
      </div>

      <div className="slowreverb-controls">
        <div className="slider-container">
          <div className="slider1-container" style={{ height: "100%" }}>
            <Slider
              orientation="vertical"
              valueLabelDisplay="auto"
              sx={{
                zIndex: "20",
                color: "#2C2E31",
                width: "2vw",
                height: "30vw",
                maxHeight: "500px",
                "& .MuiSlider-thumb": {
                  borderRadius: "5px",
                  width: "3vw",
                  color: "#FF007A",
                },
                "& .MuiSlider-valueLabel": {
                  fontFamily: "Sf Mono",
                },
              }}
              valueLabelFormat={(value: number) => {
                return (value * 100).toFixed(0).toString() + "%";
              }}
              defaultValue={0.5}
              onChange={handleSpeedChange}
              min={0}
              step={0.01}
              max={1.5}
            />
            <span className="control-label" style={{ color: "#D1D0C5" }}>
              speed
            </span>
          </div>

          <div className="slider2-container" style={{ height: "100%" }}>
            <Slider
              orientation="vertical"
              sx={{
                zIndex: "20",
                color: "#636669",
                width: "2vw",
                height: "30vw",
                maxHeight: "500px",
                "& .MuiSlider-thumb": {
                  borderRadius: "5px",
                  width: "3vw",
                  color: "#FF007A",
                },
                "& .MuiSlider-valueLabel": {
                  fontFamily: "Sf Mono",
                },
              }}
              valueLabelFormat={(value: number) => {
                return (value * 100).toFixed(0).toString() + "%";
              }}
              defaultValue={0.75}
              valueLabelDisplay="auto"
              onChange={handleReverbChange}
              step={0.01}
              min={0.1}
              max={1}
            />
            <span className="control-label" style={{ color: "#646669" }}>
              reverb
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
