import React from "react";
import Slider from "@mui/material/Slider";

interface SlidersProps {
  speed: number;
  reverb: number;
  onSpeedChange: (
    event: Event,
    value: number | number[],
    activeThumb: number
  ) => void;
  onReverbChange: (
    event: Event,
    value: number | number[],
    activeThumb: number
  ) => void;
}

const Sliders: React.FC<SlidersProps> = ({
  reverb,
  speed,
  onSpeedChange,
  onReverbChange,
}) => {
  return (
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
            defaultValue={speed}
            onChange={onSpeedChange}
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
            defaultValue={reverb}
            valueLabelDisplay="auto"
            onChange={onReverbChange}
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
  );
};

export default Sliders;
