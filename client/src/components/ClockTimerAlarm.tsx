import React, { useState, useEffect, useRef } from "react";
import { Clock } from "lucide-react";
import { WheelPicker } from "./ui/WheelPicker";
import { ClockCalendar } from "./ClockCalendar";
import { TabBar } from "./ui/TabBar";
import { ModuleHeaderBar } from "./ui/ModuleHeaderBar";
import { ModuleShell } from "./ui/ModuleShell";
import { playBeep } from "../lib/audio";

interface ClockTimerAlarmProps {
  token: string | null;
  onBack: () => void;
}

type TabType = "clock" | "alarm" | "timer" | "calendar";

export const ClockTimerAlarm: React.FC<ClockTimerAlarmProps> = ({
  token,
  onBack,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>("clock");
  const [currentTime, setCurrentTime] = useState(new Date());
  
  // Timer States
  const [timerDuration, setTimerDuration] = useState(0); // in seconds
  const [timerRemaining, setTimerRemaining] = useState(0); // in seconds
  const [isTimerActive, setIsTimerActive] = useState(false);
  const [isTimerPaused, setIsTimerPaused] = useState(false);
  const [timerH, setTimerH] = useState(0);
  const [timerM, setTimerM] = useState(5); // default 5 mins
  const [timerS, setTimerS] = useState(0);
  const [timerAlarm, setTimerAlarm] = useState(false);

  // Alarm States
  const [alarmH, setAlarmH] = useState(7); // default 07:00
  const [alarmM, setAlarmM] = useState(0);
  const [alarmActive, setAlarmActive] = useState(false);
  const [alarmTriggered, setAlarmTriggered] = useState(false);
  const lastAlarmChecked = useRef<string | null>(null);

  // Clock & Timer Intervals
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now);

      // Check alarm trigger
      const h = now.getHours();
      const m = now.getMinutes();
      const timeString = `${h}:${m}`;

      if (alarmActive && !alarmTriggered && timeString !== lastAlarmChecked.current && h === alarmH && m === alarmM) {
        lastAlarmChecked.current = timeString;
        setAlarmTriggered(true);
        playBeep("success");
      }
    }, 200);
    return () => clearInterval(timer);
  }, [alarmActive, alarmTriggered, alarmH, alarmM]);

  useEffect(() => {
    if (!isTimerActive || isTimerPaused) return;
    const interval = setInterval(() => {
      setTimerRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setIsTimerActive(false);
          setTimerAlarm(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isTimerActive, isTimerPaused]);

  useEffect(() => {
    if (!timerAlarm && !alarmTriggered) return;
    const interval = setInterval(() => {
      playBeep("success");
    }, 1500);
    return () => clearInterval(interval);
  }, [timerAlarm, alarmTriggered]);

  const tabs = [
    { id: "clock", label: "CLOCK" },
    { id: "alarm", label: "ALARM" },
    { id: "timer", label: "TIMER" },
    ...(token ? [{ id: "calendar", label: "CALENDAR" }] : []),
  ];

  const isAlarmRinging = timerAlarm || alarmTriggered;

  return (
    <ModuleShell variant="content" maxWidth="3xl" className="flex flex-col items-center justify-start gap-8">
      {!isAlarmRinging && (
        <ModuleHeaderBar
          title="Time & Calendar"
          icon={<Clock className="size-4 shrink-0 text-zinc-500" strokeWidth={1.5} />}
          onBack={onBack}
        />
      )}
      
      {isAlarmRinging ? (
        // Alarm Ringing Overlay
        <div className="flex flex-col items-center justify-center gap-8 py-12 text-center select-none animate-fade-in">
          <svg 
            className="w-32 h-32 text-white animate-pulse" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="0.8"
            strokeLinecap="round" 
            strokeLinejoin="round"
          >
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          <div className="font-mono text-sm tracking-[0.35em] text-zinc-500 uppercase mt-4">
            {timerAlarm ? "TIMER COUNTDOWN COMPLETE" : "ALARM WAKE-UP EVENT"}
          </div>
          <button
            onClick={() => {
              playBeep("click");
              setTimerAlarm(false);
              setAlarmTriggered(false);
            }}
            className="cool-circle-btn mt-10"
          >
            <span>STOP</span>
          </button>
        </div>
      ) : (
        <div className="w-full flex flex-col items-center gap-2 select-none">
          {/* Tab Selector */}
          <TabBar
            tabs={tabs}
            active={activeTab}
            onChange={(id) => setActiveTab(id as TabType)}
            variant="dot"
            className="mb-12 gap-3 sm:gap-10"
          />

          {activeTab === "clock" ? (
            // Clock Mode (Analog + Digital)
            <div className="flex flex-col items-center justify-center w-full select-none animate-fade-in">
              {/* Minimalist SVG Analog Clock */}
              {(() => {
                const hr = currentTime.getHours();
                const mn = currentTime.getMinutes();
                const sc = currentTime.getSeconds();
                const hrAngle = (hr % 12) * 30 + mn * 0.5;
                const minAngle = mn * 6 + sc * 0.1;
                const secAngle = sc * 6;
                return (
                  <svg viewBox="0 0 220 220" className="mb-12 select-none w-full max-w-[240px] sm:max-w-[320px] aspect-square">
                    {/* Outer rim */}
                    <circle cx="110" cy="110" r="100" fill="none" stroke="rgba(255, 255, 255, 0.05)" strokeWidth="1.2" />
                    {/* Major ticks */}
                    {[0, 90, 180, 270].map((angle, idx) => (
                      <line
                        key={`maj-${idx}`}
                        x1="110"
                        y1="18"
                        x2="110"
                        y2="28"
                        transform={`rotate(${angle} 110 110)`}
                        stroke="rgba(255, 255, 255, 0.5)"
                        strokeWidth="1.2"
                      />
                    ))}
                    {/* Minor ticks */}
                    {Array.from({ length: 12 }).map((_, i) => {
                      if (i % 3 === 0) return null;
                      return (
                        <line
                          key={`min-${i}`}
                          x1="110"
                          y1="18"
                          x2="110"
                          y2="23"
                          transform={`rotate(${i * 30} 110 110)`}
                          stroke="rgba(255, 255, 255, 0.15)"
                          strokeWidth="0.8"
                        />
                      );
                    })}
                    {/* Hour Hand */}
                    <line
                      x1="110"
                      y1="110"
                      x2="110"
                      y2="60"
                      transform={`rotate(${hrAngle} 110 110)`}
                      stroke="rgba(255, 255, 255, 0.85)"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                    {/* Minute Hand */}
                    <line
                      x1="110"
                      y1="110"
                      x2="110"
                      y2="42"
                      transform={`rotate(${minAngle} 110 110)`}
                      stroke="rgba(255, 255, 255, 0.6)"
                      strokeWidth="1.2"
                      strokeLinecap="round"
                    />
                    {/* Second Hand */}
                    <line
                      x1="110"
                      y1="110"
                      x2="110"
                      y2="28"
                      transform={`rotate(${secAngle} 110 110)`}
                      stroke="#ffffff"
                      strokeWidth="0.8"
                      strokeLinecap="round"
                    />
                    {/* Center Pin */}
                    <circle cx="110" cy="110" r="2.5" fill="#ffffff" />
                  </svg>
                );
              })()}

              {/* Large Digital Display */}
              <div className="font-sans font-extralight text-4xl xs:text-5xl sm:text-7xl md:text-[8rem] text-white tracking-widest select-none flex flex-wrap items-baseline justify-center gap-1">
                <span>{currentTime.getHours().toString().padStart(2, '0')}</span>
                <span className="text-zinc-700 px-2 animate-pulse">:</span>
                <span>{currentTime.getMinutes().toString().padStart(2, '0')}</span>
                <span className="text-3xl md:text-4xl text-zinc-500 font-light ml-6">
                  {currentTime.getSeconds().toString().padStart(2, '0')}
                </span>
              </div>

              {/* Date */}
              <div className="font-mono text-[13px] tracking-[0.35em] text-zinc-500 uppercase mt-8 select-none">
                {currentTime.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </div>
            </div>
          ) : activeTab === "alarm" ? (
            // Alarm Mode
            <div className="flex flex-col items-center justify-center w-full select-none animate-fade-in">
              <div className="flex flex-nowrap items-center justify-center gap-2 w-full">
                <WheelPicker
                  min={0}
                  max={23}
                  value={alarmH}
                  onChange={setAlarmH}
                  label="HOURS"
                />
                <span className="text-zinc-800 font-mono text-5xl font-extralight -mt-16">:</span>
                <WheelPicker
                  min={0}
                  max={59}
                  value={alarmM}
                  onChange={setAlarmM}
                  label="MINUTES"
                />
              </div>

              <button
                onClick={() => {
                  playBeep("success");
                  setAlarmActive(!alarmActive);
                }}
                className="cool-circle-btn mt-16"
              >
                <span>{alarmActive ? "DISARM" : "ARM"}</span>
              </button>

              {alarmActive && (
                <div className="font-mono text-[13px] tracking-[0.25em] text-zinc-500 uppercase mt-10 select-none animate-pulse">
                  ALARM SET FOR {alarmH.toString().padStart(2, '0')}:{alarmM.toString().padStart(2, '0')}
                </div>
              )}
            </div>
          ) : activeTab === "calendar" ? (
            token ? (
              <ClockCalendar token={token} playBeep={playBeep} />
            ) : null
          ) : (
            // Timer Mode
            <div className="flex flex-col items-center justify-center w-full select-none animate-fade-in">
              {isTimerActive ? (
                // Active countdown display
                <div className="flex flex-col items-center gap-12 py-4">
                  <div className="relative w-[70vw] h-[70vw] max-w-[280px] max-h-[280px] flex items-center justify-center">
                    <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                      <circle
                        cx="50"
                        cy="50"
                        r="46"
                        className="stroke-zinc-950 fill-none"
                        strokeWidth="0.8"
                      />
                      <circle
                        cx="50"
                        cy="50"
                        r="46"
                        className="stroke-white fill-none transition-all duration-1000 ease-linear"
                        strokeWidth="1.2"
                        strokeDasharray="289"
                        strokeDashoffset={timerDuration > 0 ? 289 * (1 - timerRemaining / timerDuration) : 0}
                        strokeLinecap="round"
                      />
                    </svg>
                    
                    <div className="absolute flex flex-col items-center justify-center font-mono">
                      <span className="text-6xl font-extralight text-white tracking-widest">
                        {Math.floor(timerRemaining / 60).toString().padStart(2, '0')}:
                        {(timerRemaining % 60).toString().padStart(2, '0')}
                      </span>
                      {timerRemaining >= 3600 ? (
                        <span className="text-[13px] text-zinc-500 uppercase tracking-[0.25em] mt-4">
                          {Math.floor(timerRemaining / 3600)}h remaining
                        </span>
                      ) : (
                        <span className="text-[13px] text-zinc-500 uppercase tracking-[0.25em] mt-4 animate-pulse">
                          COUNTDOWN
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Controls */}
                  <div className="flex gap-8 mt-2 items-center">
                    <button
                      onClick={() => {
                        playBeep("click");
                        setIsTimerPaused(!isTimerPaused);
                      }}
                      className="text-white opacity-55 hover:opacity-100 font-mono text-[13px] tracking-[0.2em] uppercase transition-opacity cursor-pointer"
                    >
                      {isTimerPaused ? "RESUME" : "PAUSE"}
                    </button>
                    <span className="text-zinc-800">|</span>
                    <button
                      onClick={() => {
                        playBeep("error");
                        setIsTimerActive(false);
                        setIsTimerPaused(false);
                        setTimerRemaining(0);
                      }}
                      className="text-zinc-500 hover:text-white font-mono text-[13px] tracking-[0.2em] uppercase transition-colors cursor-pointer"
                    >
                      RESET
                    </button>
                  </div>
                </div>
              ) : (
                // Timer setup layout
                <div className="flex flex-col items-center justify-center w-full">
                  <div className="flex flex-nowrap items-center justify-center gap-2 w-full">
                    <WheelPicker
                      min={0}
                      max={23}
                      value={timerH}
                      onChange={setTimerH}
                      label="HOURS"
                    />
                    <span className="text-zinc-800 font-mono text-5xl font-extralight -mt-16">:</span>
                    <WheelPicker
                      min={0}
                      max={59}
                      value={timerM}
                      onChange={setTimerM}
                      label="MINUTES"
                    />
                    <span className="text-zinc-800 font-mono text-5xl font-extralight -mt-16">:</span>
                    <WheelPicker
                      min={0}
                      max={59}
                      value={timerS}
                      onChange={setTimerS}
                      label="SECONDS"
                    />
                  </div>

                  <button
                    onClick={() => {
                      const totalSec = timerH * 3600 + timerM * 60 + timerS;
                      if (totalSec > 0) {
                        playBeep("success");
                        setTimerDuration(totalSec);
                        setTimerRemaining(totalSec);
                        setIsTimerActive(true);
                        setIsTimerPaused(false);
                      } else {
                        playBeep("error");
                      }
                    }}
                    className="cool-circle-btn mt-16"
                  >
                    <span>START</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </ModuleShell>
  );
};
