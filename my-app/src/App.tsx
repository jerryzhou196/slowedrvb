import React, { useState, useCallback, useRef, FC } from "react";
import logo from "./logo.svg";
import "./App.css";
import VinylStick from "./resources/stick.svg";
import { useDropzone } from "react-dropzone";
import * as Tone from "tone";


const App: FC = () => {
    const [audioFile, setAudioFile] = useState<File | null>(null);
    //1185 

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      if (event.target.files?.length) {
        const file = event.target.files[0];
        setAudioFile(file);
        processAudio(file);
      }
    };

    const processAudio = (file: File) => {
      const audioContext = new AudioContext();
      const reader = new FileReader();

  reader.onload = async (ev: ProgressEvent<FileReader>) => {
    if (ev.target?.result) {
      const audioData = ev.target.result as ArrayBuffer;
      try {
        // Create a Blob from the ArrayBuffer
        const blob = new Blob([audioData], { type: "audio/mp3" });
        
        // Use Tone.js to create a URL from the Blob
        const url = URL.createObjectURL(blob);

        // Use Tone.Player to play the audio
                const reverb = new Tone.Reverb({
                  decay: 5,
                  wet: 0.5,
                  preDelay: 0.1,
                }).toDestination();
                
        const player = new Tone.Player(url).toDestination();
        player.connect(reverb)
        
        


        
        
        player.autostart = true;

        // When done, clean up the URL object
        player.onstop = () => {
          URL.revokeObjectURL(url);
        };
      } catch (error) {
        console.error("Error decoding audio data:", error);
      }
    }
  };

      reader.readAsArrayBuffer(file);
    };
    
    

  const onDrop = useCallback((acceptedFiles: File[]) => {
    // handle file drop
    console.log(acceptedFiles);
  }, []);

  

    const [isPlaying, setIsPlaying] = useState(false);
    const player = useRef(null);
    const reverb = useRef(null);


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

  return (
    <div className="App">
      <div className="musicplayer-container">
        <div className="vinyl-player">
          <div style={{ width: "100%" }}>
            <div style={{ marginBottom: "1vw" }}>
              <button className="chooseFile" onClick={onButtonClick}>
                <span className="chooseFile-text">choose mp3 file</span>{" "}
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
            className={`Disc circle ${isDragActive ? "rotate" : ""}`}
          >
            <div className="inner-disc circle">
              <span className="track-name"> Tyler The Creator</span>
            </div>
          </div>
          <img src={VinylStick} alt="Vinyl Stick" className="stick" />
        </div>
      </div>
      <div className="slowreverb-controls"></div>
    </div>
  );
};

export default App;
