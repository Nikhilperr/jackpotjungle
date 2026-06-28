import { useRef, useEffect, KeyboardEvent, ClipboardEvent } from "react";
import { motion } from "framer-motion";

interface OTPInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  hasError?: boolean;
}

export function OTPInput({ value, onChange, disabled, hasError }: OTPInputProps) {
  const inputsRef = useRef<HTMLInputElement[]>([]);

  // Split string value into array of 6 digits
  const digits = value.split("").slice(0, 6);
  while (digits.length < 6) digits.push("");

  useEffect(() => {
    // Focus first empty slot on mount
    const firstEmptyIndex = digits.findIndex(d => !d);
    const targetIdx = firstEmptyIndex === -1 ? 5 : firstEmptyIndex;
    if (inputsRef.current[targetIdx] && !disabled) {
      inputsRef.current[targetIdx].focus();
    }
  }, []);

  const focusSlot = (index: number) => {
    if (inputsRef.current[index]) {
      inputsRef.current[index].focus();
      inputsRef.current[index].select();
    }
  };

  const handleDigitChange = (index: number, val: string) => {
    const cleanDigit = val.replace(/[^0-9]/g, "").slice(-1);
    const nextDigits = [...digits];
    nextDigits[index] = cleanDigit;
    
    const newValue = nextDigits.join("");
    onChange(newValue);

    // Auto-advance
    if (cleanDigit && index < 5) {
      focusSlot(index + 1);
    }
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      if (!digits[index] && index > 0) {
        // Empty slot, go backward
        focusSlot(index - 1);
        const nextDigits = [...digits];
        nextDigits[index - 1] = "";
        onChange(nextDigits.join(""));
      } else {
        // Clear current slot
        const nextDigits = [...digits];
        nextDigits[index] = "";
        onChange(nextDigits.join(""));
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      focusSlot(index - 1);
    } else if (e.key === "ArrowRight" && index < 5) {
      focusSlot(index + 1);
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData("text").replace(/[^0-9]/g, "").slice(0, 6);
    if (pasteData) {
      onChange(pasteData);
      // Focus last pasted or next slot
      const targetIdx = Math.min(pasteData.length, 5);
      focusSlot(targetIdx);
    }
  };

  return (
    <motion.div 
      animate={hasError ? { x: [-10, 10, -10, 10, 0] } : {}}
      transition={{ duration: 0.4 }}
      className="flex justify-center gap-2 md:gap-3"
    >
      {digits.map((digit, idx) => (
        <motion.input
          key={idx}
          ref={(el) => {
            if (el) inputsRef.current[idx] = el;
          }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={1}
          value={digit}
          onChange={(e) => handleDigitChange(idx, e.target.value)}
          onKeyDown={(e) => handleKeyDown(idx, e)}
          onPaste={handlePaste}
          disabled={disabled}
          className={`h-12 w-12 md:h-14 md:w-14 text-center text-xl font-bold bg-background/50 border rounded-2xl focus:outline-none focus:ring-2 transition-all select-all ${
            hasError
              ? "border-destructive focus:ring-destructive/30"
              : digit
              ? "border-primary focus:ring-primary/20"
              : "border-border/80 focus:ring-primary/20"
          }`}
        />
      ))}
    </motion.div>
  );
}
