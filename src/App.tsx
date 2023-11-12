import React, { useState, useCallback, useRef, FC, useEffect } from "react";
import logo from "./logo.svg";
import "./App.css";
import VinylStick from "./resources/stick.svg";
import Pause from "./resources/pause.svg";
import Play from "./resources/play.svg";

import { useDropzone } from "react-dropzone";
import * as Tone from "tone";
import Slider from "@mui/material/Slider";

import track1 from "./resources/sauce/kanye.mp3";
import track2 from "./resources/sauce/stillwithyou.mp3"
import track3 from "./resources/sauce/spacesong.mp3";
import track4 from "./resources/sauce/unforgettable.mp3";
import track5 from "./resources/sauce/xuehuahua.mp3";
import track6 from "./resources/sauce/The Neighbourhood - Sweater Weather.mp3";



let trackIndex: number = 0;
const tracks = [
  [track6, "the neighbourhood - SWEATER WEATHER"],
  [track1, "kanye west - FLASHING LIGHTS"],
  [track4, "french montana - UNFORGETTABLE"],
  [track2, "to heny 💖"],
  [track3, "beach house - SPACE SONG"],
  [track5, "random chinese dude - XUE HUA PIAO PIAO"],
];



const App: FC = () => {
    const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
    const [fileName, setFileName] = useState<String >("");
    const [player, setPlayer] = useState<Tone.Player | null>(null);
    const [reverb, setReverb] = useState<Tone.Reverb | null>(null);
    const [decay, setDecay] = useState<Number>(1);
    const [playbackRate, setPlaybackRate] = useState<Number>(1);
    const [playing, setPlaying] = useState<Boolean>(false);

  
    useEffect(() => {
          loadRandomSong();
    },[])

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
    {url, volume: -10, playbackRate: 0.75}
    ).toDestination();
   // ... (reverb and player initialization remains unchanged)
   const reverb = new Tone.Reverb({
    decay: 20, 
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
        setPlaying(true);
        player.start();
        document.getElementById("Disc")?.classList.add("rotate");
      } else if (audioBlob) {
        runPlayer(audioBlob);
      }
    }


 const loadRandomSong = () => {
   // Fetch the array buffer of the randomly selected track
   stopMusic();
   const track = tracks[trackIndex % tracks.length];
   trackIndex += 1;

   fetch(track[0])
     .then((response) => response.arrayBuffer())
     .then((arrayBuffer) => {
       const blob = new Blob([arrayBuffer], { type: "audio/mp3" });
      setAudioBlob(blob);
      setFileName(track[1])
      if (player){
        changePlayerSong(blob, player);
      } else {
        initializePlayer(blob);
      }

     })
     .catch((error) => {
       console.error("Error loading track:", error);
     });
 };



  return (
    <div className="App">
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
              max={2}
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
