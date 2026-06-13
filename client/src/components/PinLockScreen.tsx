import React, { useState, useEffect, useRef } from "react";
import { env } from "@/env";
import { playBeep } from "../lib/audio";

interface PinLockScreenProps {
  token: string | null;
  setToken: (token: string | null) => void;
  isAuthenticated: boolean | null;
  setIsAuthenticated: (val: boolean | null) => void;
  isUnlocked: boolean;
  setIsUnlocked: (val: boolean) => void;
}

export const PinLockScreen: React.FC<PinLockScreenProps> = ({
  token,
  setToken,
  isAuthenticated,
  setIsAuthenticated,
  isUnlocked,
  setIsUnlocked,
}) => {
  const [pinDigits, setPinDigits] = useState<string[]>([]);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isShaking, setIsShaking] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  
  const inputRef = useRef<HTMLInputElement>(null);

  // Verify stored token on load
  useEffect(() => {
    const verifyStoredToken = async () => {
      if (!token) {
        setIsAuthenticated(false);
        return;
      }
      
      try {
        setIsVerifying(true);
        const res = await fetch(`${env.VITE_API_URL}/api/verify-token`, {
          headers: {
            "Authorization": `Bearer ${token}`
          }
        });
        
        if (res.ok) {
          setIsUnlocked(true);
          setIsAuthenticated(true);
        } else {
          localStorage.removeItem("auraflow_pin_token");
          setToken(null);
          setIsAuthenticated(false);
        }
      } catch {
        localStorage.removeItem("auraflow_pin_token");
        setToken(null);
        setIsAuthenticated(false);
      } finally {
        setIsVerifying(false);
      }
    };
    
    verifyStoredToken();
  }, [token, setToken, setIsAuthenticated, setIsUnlocked]);

  // Trigger error feedback
  const triggerAuthError = (message: string) => {
    playBeep("error");
    setIsShaking(true);
    setAuthError(message);
    setPinDigits([]);
    
    if (navigator.vibrate) {
      navigator.vibrate([100, 50, 100]);
    }
    
    setTimeout(() => {
      setIsShaking(false);
    }, 450);
  };

  // Submit PIN to server
  const submitPin = async (pinCode: string) => {
    setIsVerifying(true);
    setAuthError(null);
    
    try {
      const res = await fetch(`${env.VITE_API_URL}/api/verify-pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pinCode }),
      });
      
      const data = await res.json();
      
      if (res.ok && data.success) {
        playBeep("success");
        setIsUnlocked(true);
        // Wait for unlocking slide-up animation
        setTimeout(() => {
          setToken(data.token);
          localStorage.setItem("auraflow_pin_token", data.token);
          setIsAuthenticated(true);
        }, 500);
      } else {
        triggerAuthError(data.error || "Authentication failed");
      }
    } catch {
      triggerAuthError("Database / Server Offline");
    } finally {
      setIsVerifying(false);
    }
  };

  // Auto-focus input on mount or when overlay is shown
  useEffect(() => {
    if (isAuthenticated === false) {
      inputRef.current?.focus();
    }
  }, [isAuthenticated]);

  if (isAuthenticated) return null;

  return (
    <div 
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center p-4 bg-black transition-all duration-500 ${
        isUnlocked ? "opacity-0 scale-[1.08] pointer-events-none" : "opacity-100 scale-100"
      }`}
    >
      {/* Light glow effect in the center behind the boxes */}
      <div className="absolute w-[250px] h-[250px] bg-white/[0.05] rounded-full blur-[70px] pointer-events-none animate-pulse" />

      <div 
        className={`relative flex flex-col items-center justify-center p-4 transition-all duration-300 ${
          isShaking ? "animate-shake" : ""
        }`}
      >
        {/* 4 Boxes in the center */}
        <div 
          className="relative flex justify-center gap-4 cursor-pointer" 
          onClick={() => inputRef.current?.focus()}
        >
          <input
            ref={inputRef}
            type="text"
            pattern="[0-9]*"
            inputMode="numeric"
            maxLength={4}
            value={pinDigits.join("")}
            onChange={(e) => {
              const val = e.target.value.replace(/[^0-9]/g, "");
              const digits = val.split("");
              setPinDigits(digits);
              if (digits.length === 4) {
                submitPin(val);
              }
            }}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            autoFocus
            disabled={isVerifying || isUnlocked}
          />
          {[0, 1, 2, 3].map((index) => {
            const filled = pinDigits.length > index;
            const isFocused = pinDigits.length === index && !isVerifying && !isUnlocked;
            return (
              <div
                key={index}
                className="flex flex-col items-center gap-3 w-12"
              >
                <div className={`h-8 flex items-center justify-center font-mono text-2xl font-light transition-all duration-200 ${
                  filled ? "text-white" : "text-white/20"
                }`}>
                  {filled ? (isUnlocked ? "" : "•") : ""}
                </div>
                <div className={`w-full h-[1.5px] transition-all duration-300 ${
                  isFocused 
                    ? "bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)] scale-x-110" 
                    : filled 
                      ? "bg-white/60" 
                      : "bg-white/15"
                }`} />
              </div>
            );
          })}
        </div>
        
        {/* Minimal feedback indicator for status/error */}
        {authError && (
          <div className="absolute -bottom-8 font-mono text-[13px] text-white/40 uppercase tracking-widest animate-pulse">
            {authError}
          </div>
        )}
      </div>
    </div>
  );
};
