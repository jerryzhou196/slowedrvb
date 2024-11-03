import React, { useState, useCallback, useRef, FC, useEffect } from "react";
import "./App.css";
import VinylStick from "./resources/stick.svg";
import Pause from "./resources/pause.svg";
import Play from "./resources/play.svg";

import Sliders from "./components/Sliders";

import { useTracks, Track } from "./hooks/useTracks";
import { useTonePlayer } from "./hooks/useTonePlayer";

const App: FC = () => {
  const [reverb, setReverbAmount] = useState(0.1);
  const [speed, setSpeedAmount] = useState(1.0);
  const [fileURL, setFileURL] = useState("");
  const [fileName, setFileName] = useState("");

  const { getRandomTrack, getNextTrack } = useTracks();

  const { isLoaded, togglePlay, setReverb, setSpeed, isPlaying } =
    useTonePlayer(fileURL, reverb, speed);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchRandomTrack = useCallback(async () => {
    try {
      const track = getRandomTrack();
      const trackUrl = `https://d3m8x313oqkwp.cloudfront.net/${track.file}`;

      const cache = await caches.open("track-cache");
      const cachedResponse = await cache.match(trackUrl);

      if (cachedResponse) {
        const blob = await cachedResponse.blob();
        setFileName(track.name);
        setFileURL(URL.createObjectURL(blob));
        return;
      }

      const networkResponse = await fetch(trackUrl);
      const blob = await networkResponse.blob();
      setFileName(track.name);
      setFileURL(URL.createObjectURL(blob));
      await cache.put(trackUrl, networkResponse.clone());
    } catch (err) {
      console.error("Error fetching track:", err);
    }
  }, [getRandomTrack]); // Now stable with useCallback

  useEffect(() => {
    fetchRandomTrack();
  }, [fetchRandomTrack]); // Dependency is stable

  // File Input Event Handlers

  const handleChooseFile = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const blob = new Blob([file], { type: file.type });
      setFileURL(URL.createObjectURL(blob));
    }
  };

  // Slider Event Handlers

  const handleSpeedChange = (
    event: Event,
    value: number[] | number,
    activeThumb: number
  ) => {
    if (typeof value == "number" && isLoaded) {
      const spinSpeed = 1 / value;
      setSpeedAmount(value);
      document.documentElement.style.setProperty(
        "--rotation-duration",
        `${spinSpeed}s`
      );
      setSpeed(value);
    }
  };

  const handleReverbChange = (
    event: Event,
    value: number | number[],
    activeThumb: number
  ) => {
    if (typeof value == "number" && isLoaded) {
      setReverbAmount(value);
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
              <button className="sauceMeUp" onClick={fetchRandomTrack}>
                <span className="sauceMeUp-text" onClick={fetchRandomTrack}>
                  sauce me up
                </span>
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
          <div id="Disc" className={`Disc circle ${isPlaying ? "rotate" : ""}`}>
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

      <Sliders
        speed={speed}
        reverb={reverb}
        onSpeedChange={handleSpeedChange}
        onReverbChange={handleReverbChange}
      />
    </div>
  );
};

export default App;
