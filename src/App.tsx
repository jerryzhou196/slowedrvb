import React, { useState, useCallback, useRef, FC, useEffect } from "react";
import "./App.css";
import VinylStick from "./resources/stick.svg";
import Pause from "./resources/pause.svg";
import Play from "./resources/play.svg";

import Slider from "@mui/material/Slider";

import { useTracks, Track } from "./hooks/useTracks";
import { useTonePlayer } from "./hooks/useTonePlayer";

const App: FC = () => {
  const [reverbAmount, setReverbAmount] = useState(0.5);
  const [speed, setSpeedAmount] = useState(1.0);
  const [fileName, setFileName] = useState("");

  const { getRandomTrack, getNextTrack } = useTracks();
  const { isLoaded, isPlaying, togglePlay, setReverb, setSpeed } = useTonePlayer(fileName, speed, reverbAmount);

  const fileInputRef = useRef<HTMLInputElement>(null);


  const fetchRandomTrack = useCallback(async () => {
    try {
      const track = getRandomTrack();
      const trackUrl = `https://d3m8x313oqkwp.cloudfront.net/${track.file}`;

      const cache = await caches.open("track-cache");
      const cachedResponse = await cache.match(trackUrl);

      if (cachedResponse) {
        const blob = await cachedResponse.blob();
        setFileName(URL.createObjectURL(blob));
        return;
      }

      const networkResponse = await fetch(trackUrl);
      const blob = await networkResponse.blob();
      setFileName(URL.createObjectURL(blob));
      await cache.put(trackUrl, networkResponse.clone());
    } catch (err) {
      console.error("Error fetching track:", err);
    }
  }, [getRandomTrack]); // Now stable with useCallback

  useEffect(() => {
    fetchRandomTrack();
  }, [fetchRandomTrack]); // Dependency is stable

  // Event Handlers


  // File Input Event Handlers

  const handleChooseFile = () => {
    fileInputRef.current?.click();
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFileName(URL.createObjectURL(file));
    }
  }

  // Slider Event Handlers

  const handleSpeedChange = (
        event: Event,
        value: number[] | number,
        activeThumb: number
  ) => {
    if (typeof value == "number" && isLoaded) {
      const spinSpeed = 1 / value;
      document.documentElement.style.setProperty(
        "--rotation-duration",
        `${spinSpeed}s`
    );
    setSpeed(value);
  }
  };

  const handleReverbChange = (
    event: Event,
    value: number[] | number,
    activeThumb: number
  ) => {
    if (typeof value == "number" && isLoaded) {
      setReverb(value);
    }
  };

  return (
    <div className="App">
      <header className="header-label">
        <div className="header-label-container">
          <div className="header-label-subtitle"> a jerry zhou project</div>
          <div className="header-label-title"> slowedrvb.com </div>
        </div>
      </header>
      <div className="musicplayer-container">
        <div className="vinyl-player">
          <div style={{ width: "100%" }}>
            <div style={{ marginBottom: "1vw" }}>
              <button
                className="sauceMeUp"
                onClick={() => {
                  const track: Track = getRandomTrack();
                  const trackUrl =
                    "https://d3m8x313oqkwp.cloudfront.net/" + track.file;
                  setFileName(trackUrl);
                }}
              >
                <span className="sauceMeUp-text" onClick={fetchRandomTrack}>sauce me up</span>
              </button>
              <button className="chooseFile" onClick={handleChooseFile}>
                <span className="chooseFile-text">choose mp3 file</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                style={{ display: "none" }}
                onChange={handleFileChange}
                accept="audio/mp3"
              />
              <div className="chooseFile-subtext">
                or drag it onto the
                <span style={{ color: "#D1D0C5" }}> disc </span>
              </div>
            </div>
          </div>
          <div
            id="Disc"
            className={`Disc circle ${isPlaying ? "rotate" : ""}`}
          >
            <div className="inner-disc circle">
              <span className="track-name"> {fileName}</span>
            </div>
          </div>
          <img src={VinylStick} alt="Vinyl Stick" className="stick" />
          <img
            id="playback"
            alt="Play Button"
            src={isPlaying ? Pause : Play}
            onClick={togglePlay}
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
              min={0}
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
