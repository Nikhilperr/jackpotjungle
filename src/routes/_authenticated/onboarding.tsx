import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { User, Phone, MapPin, Mail, Camera, Loader2, Check, X, Search, Globe } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthInput } from "@/components/auth/AuthInput";
import { AuthButton } from "@/components/auth/AuthButton";
import { uploadAndSign } from "@/lib/chat-media";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({ meta: [{ title: "Complete your profile — Jackpot Jungle" }] }),
  component: OnboardingPage,
});

interface Country {
  name: string;
  code: string;
  flag: string;
}

const COUNTRIES: Country[] = [
  { name: "United States", code: "+1", flag: "🇺🇸" },
  { name: "Canada", code: "+1", flag: "🇨🇦" },
  { name: "Nepal", code: "+977", flag: "🇳🇵" },
  { name: "United Kingdom", code: "+44", flag: "🇬🇧" },
  { name: "Australia", code: "+61", flag: "🇦🇺" },
  { name: "India", code: "+91", flag: "🇮🇳" },
  { name: "Germany", code: "+49", flag: "🇩🇪" },
  { name: "France", code: "+33", flag: "🇫🇷" },
  { name: "United Arab Emirates", code: "+971", flag: "🇦🇪" },
  { name: "Saudi Arabia", code: "+966", flag: "🇸🇦" },
  { name: "Singapore", code: "+65", flag: "🇸🇬" },
  { name: "Japan", code: "+81", flag: "🇯🇵" },
  { name: "Brazil", code: "+55", flag: "🇧🇷" },
  { name: "South Africa", code: "+27", flag: "🇿🇦" },
];

function OnboardingPage() {
  const navigate = useNavigate();
  const [meId, setMeId] = useState<string | null>(null);
  
  // Fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [phoneDial, setPhoneDial] = useState("+1");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [address, setAddress] = useState("");
  
  // Avatar
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Verification & Status
  const [usernameError, setUsernameError] = useState("");
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [saving, setSaving] = useState(false);

  // Country Picker Dropdown
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");
  const countryPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (u.user && mounted) {
        setMeId(u.user.id);
        setEmail(u.user.email ?? "");
        
        // Load existing profile details if any
        const { data: profile } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", u.user.id)
          .maybeSingle();

        if (profile && mounted) {
          setUsername(profile.username ?? "");
          setFirstName(profile.first_name ?? "");
          setLastName(profile.last_name ?? "");
          setAvatarUrl(profile.avatar_url ?? null);
          setAddress(profile.address ?? "");
          
          if (profile.phone) {
            // Split country code and number
            const match = profile.phone.match(/^(\+\d+)\s*(.*)$/);
            if (match) {
              setPhoneDial(match[1]);
              setPhoneNumber(match[2]);
            } else {
              setPhoneNumber(profile.phone);
            }
          }
        }
      }
    })();

    // Handle clicks outside country picker
    function handleClickOutside(event: MouseEvent) {
      if (countryPickerRef.current && !countryPickerRef.current.contains(event.target as Node)) {
        setShowCountryPicker(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      mounted = false;
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Check if profile was completed on another device
  useEffect(() => {
    if (!meId) return;
    const interval = setInterval(async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("first_name, last_name")
        .eq("id", meId)
        .maybeSingle();

      if (profile?.first_name?.trim() && profile?.last_name?.trim()) {
        if (typeof window !== "undefined") {
          localStorage.setItem("profile_complete", "true");
        }
        toast.success("Profile completed on another device! Redirecting...");
        navigate({ to: "/chat", replace: true });
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [meId, navigate]);

  // Username validation debouncer
  useEffect(() => {
    const trimmed = username.trim();
    if (trimmed.length === 0) {
      setUsernameError("");
      return;
    }
    if (trimmed.length < 3) {
      setUsernameError("Username must be at least 3 characters.");
      return;
    }
    if (trimmed.length > 20) {
      setUsernameError("Username must be under 20 characters.");
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
      setUsernameError("Letters, numbers, and underscores only.");
      return;
    }

    setCheckingUsername(true);
    const delay = setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("id")
          .eq("username", trimmed)
          .maybeSingle();
        
        if (error) throw error;
        if (data && data.id !== meId) {
          setUsernameError("Username is already taken.");
        } else {
          setUsernameError("");
        }
      } catch (err) {
        console.error(err);
      } finally {
        setCheckingUsername(false);
      }
    }, 400);

    return () => clearTimeout(delay);
  }, [username, meId]);

  async function handleAvatarClick() {
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !meId) return;

    setUploadingAvatar(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const publicUrl = await uploadAndSign("avatars", meId, file, ext, file.type);
      setAvatarUrl(publicUrl);
      toast.success("Profile picture uploaded!");
    } catch (err: any) {
      toast.error(err.message ?? "Could not upload profile picture.");
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!meId) return;
    if (!firstName.trim() || !lastName.trim()) {
      toast.error("First Name and Last Name are required.");
      return;
    }
    if (!username.trim() || usernameError) {
      toast.error("Please enter a valid, unique username.");
      return;
    }

    setSaving(true);
    try {
      const fullPhone = phoneNumber.trim() ? `${phoneDial} ${phoneNumber.trim()}` : null;
      
      // Check if the user profile row already exists in the table
      const { data: existing } = await supabase
        .from("profiles")
        .select("id, friend_code, referral_code")
        .eq("id", meId)
        .maybeSingle();

      if (existing) {
        // Update the existing profile
        const { error: profileError } = await supabase
          .from("profiles")
          .update({
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            username: username.trim(),
            phone: fullPhone,
            address: address.trim() || null,
            avatar_url: avatarUrl,
          })
          .eq("id", meId);

        if (profileError) throw profileError;
      } else {
        // Insert a new profile and generate valid unique friend/referral codes to satisfy NOT NULL constraints
        const randCode = () => Math.floor(100000 + Math.random() * 900000).toString();
        const { error: profileError } = await supabase
          .from("profiles")
          .insert({
            id: meId,
            username: username.trim(),
            email: email,
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            phone: fullPhone,
            address: address.trim() || null,
            avatar_url: avatarUrl,
            friend_code: `JJM-${randCode()}`,
            referral_code: `JJREF-${randCode()}`,
          });

        if (profileError) throw profileError;
      }

      // Update auth metadata to mark complete
      const { error: authError } = await supabase.auth.updateUser({
        data: { username_onboarded: true }
      });
      if (authError) throw authError;

      if (typeof window !== "undefined") {
        localStorage.setItem("profile_complete", "true");
      }
      toast.success("Profile completed! Welcome to Jackpot Jungle.");
      navigate({ to: "/chat", replace: true });
    } catch (err: any) {
      toast.error(err.message ?? "Could not save profile details.");
    } finally {
      setSaving(false);
    }
  }

  const filteredCountries = COUNTRIES.filter((c) =>
    c.name.toLowerCase().includes(countrySearch.toLowerCase()) ||
    c.code.includes(countrySearch)
  );

  const selectedCountry = COUNTRIES.find((c) => c.code === phoneDial) || COUNTRIES[0];

  return (
    <AuthLayout hideHeader={true}>
      <AuthCard className="max-w-md w-full">
        {/* Warning Banner */}
        <div className="mb-4 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-start gap-2.5 text-amber-500 text-xs leading-relaxed font-semibold">
          <Globe className="h-4 w-4 shrink-0 mt-0.5" />
          <span>Your profile setup is incomplete. Please finish entering your details to access Jackpot Jungle.</span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Profile Picture Upload */}
          <div className="flex flex-col items-center gap-2 py-1">
            <div 
              onClick={handleAvatarClick}
              className="relative h-20 w-20 rounded-full bg-secondary border border-border flex items-center justify-center cursor-pointer overflow-hidden group shadow-inner"
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
              ) : (
                <User className="h-8 w-8 text-muted-foreground" />
              )}
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                {uploadingAvatar ? (
                  <Loader2 className="h-5 w-5 animate-spin text-white" />
                ) : (
                  <Camera className="h-5 w-5 text-white" />
                )}
              </div>
            </div>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              accept="image/*" 
              className="hidden" 
            />
            <span className="text-[11px] font-medium text-muted-foreground">Upload Profile Photo (Optional)</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <AuthInput
              label="First Name *"
              placeholder="First name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              icon={<User className="h-4 w-4" />}
            />
            <AuthInput
              label="Last Name *"
              placeholder="Last name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
              icon={<User className="h-4 w-4" />}
            />
          </div>

          {/* Username */}
          <div className="space-y-1">
            <div className="relative">
              <AuthInput
                label="Username *"
                placeholder="Choose username"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, ""))}
                required
                icon={<User className="h-4 w-4" />}
              />
              <div className="absolute right-3.5 top-[38px] flex items-center justify-center">
                {checkingUsername && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                {!checkingUsername && username.trim().length >= 3 && !usernameError && (
                  <Check className="h-4 w-4 text-green-500" />
                )}
                {!checkingUsername && username.trim().length >= 3 && usernameError && (
                  <X className="h-4 w-4 text-destructive" />
                )}
              </div>
            </div>
            {usernameError && (
              <p className="text-[11px] text-red-500 font-bold px-1.5 flex items-center gap-1.5 animate-pulse">
                <X className="h-3.5 w-3.5 shrink-0" />
                <span>{usernameError}</span>
              </p>
            )}
          </div>

          {/* Prefilled Email (Disabled) */}
          <AuthInput
            label="Email Address"
            value={email}
            disabled
            icon={<Mail className="h-4 w-4" />}
            className="opacity-60 bg-secondary"
          />

          {/* Phone Number with Country Dial Code Picker */}
          <div className="space-y-1.5 relative">
            <label className="text-xs font-semibold text-foreground px-1">Phone Number (Optional)</label>
            <div className="flex gap-2">
              {/* Dial Code Button */}
              <div ref={countryPickerRef} className="relative">
                <button
                  type="button"
                  onClick={() => setShowCountryPicker(!showCountryPicker)}
                  className="h-11 px-3 border border-border/80 bg-background/50 hover:bg-secondary/40 text-foreground transition-colors flex items-center gap-1.5 rounded-2xl text-xs font-semibold select-none"
                >
                  <span>{selectedCountry.flag}</span>
                  <span>{phoneDial}</span>
                </button>

                {/* Country List Dropdown */}
                <AnimatePresence>
                  {showCountryPicker && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="absolute left-0 mt-1 w-64 bg-card border border-border shadow-2xl rounded-2xl p-2 z-50 flex flex-col gap-2 max-h-60 overflow-y-auto no-scrollbar"
                    >
                      <div className="relative">
                        <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input
                          placeholder="Search country..."
                          value={countrySearch}
                          onChange={(e) => setCountrySearch(e.target.value)}
                          className="w-full pl-8 pr-3 py-1.5 text-xs bg-secondary border-transparent rounded-xl focus:outline-none focus:ring-1 focus:ring-primary/20"
                        />
                      </div>
                      <div className="space-y-0.5">
                        {filteredCountries.map((c) => (
                          <button
                            key={`${c.name}-${c.code}`}
                            type="button"
                            onClick={() => {
                              setPhoneDial(c.code);
                              setShowCountryPicker(false);
                              setCountrySearch("");
                            }}
                            className="w-full text-left px-2.5 py-1.5 text-xs hover:bg-secondary rounded-lg flex items-center justify-between"
                          >
                            <span className="flex items-center gap-2">
                              <span>{c.flag}</span>
                              <span className="truncate max-w-[130px]">{c.name}</span>
                            </span>
                            <span className="font-semibold text-muted-foreground">{c.code}</span>
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Number Input */}
              <div className="flex-1">
                <input
                  type="tel"
                  placeholder="Enter phone number"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value.replace(/[^\d\s-]/g, ""))}
                  className="h-11 w-full px-4 border border-border/80 bg-background/50 text-foreground transition-all rounded-2xl text-xs font-semibold focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
                />
              </div>
            </div>
          </div>

          {/* Address */}
          <AuthInput
            label="Home Address (Optional)"
            placeholder="Enter home address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            icon={<MapPin className="h-4 w-4" />}
          />

          <div className="space-y-3 pt-2">
            <AuthButton 
              type="submit" 
              busy={saving} 
              disabled={saving || checkingUsername || !!usernameError || username.trim().length < 3 || !firstName.trim() || !lastName.trim()}
              className="w-full shadow-lg transition-all duration-200"
            >
              Finish Account Creation
            </AuthButton>

            <button
              type="button"
              onClick={async () => {
                try {
                  await supabase.auth.signOut();
                  navigate({ to: "/auth", search: { mode: "login" } });
                } catch (err: any) {
                  toast.error(err.message || "Failed to sign out");
                }
              }}
              className="block w-full text-center text-xs text-muted-foreground hover:text-foreground font-semibold py-1.5 transition-colors select-none"
            >
              Back to Login
            </button>
          </div>
        </form>
      </AuthCard>
    </AuthLayout>
  );
}
