import { createFileRoute } from "@tanstack/react-router";
import { PublicLayout } from "@/components/landing/PublicLayout";
import { Download, ShieldCheck, Smartphone, Cpu, Check, HelpCircle } from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";

export const Route = createFileRoute("/download")({
  head: () => ({
    meta: [
      { title: "Download App — Jackpot Jungle Messenger & Casino" },
      { name: "description", content: "Download the official Jackpot Jungle native Android APK app. Experience secure slots, sweepstakes, daily free chips, and instant player messenger." },
      { property: "og:title", content: "Download App — Jackpot Jungle Messenger & Casino" },
      { property: "og:description", content: "Get the official Jackpot Jungle mobile client on Android. Private chats, progressive slots, and fast client performance." },
      { property: "og:url", content: "https://playjackpotjungle.com/download" },
      { name: "twitter:title", content: "Download App — Jackpot Jungle Messenger & Casino" },
      { name: "twitter:description", content: "Download the official Jackpot Jungle native Android APK app. Play slots, sweepstakes, and chat in real-time." },
    ],
  }),
  component: DownloadPage,
});

function DownloadPage() {
  const [activeFaq, setActiveFaq] = useState<number | null>(null);

  const installationSteps = [
    {
      num: "01",
      title: "Download the APK",
      desc: "Tap the download button below to fetch the official Jackpot Jungle APK file securely.",
    },
    {
      num: "02",
      title: "Enable Unknown Sources",
      desc: "Go to Settings > Security on your device and check 'Allow installation of apps from unknown sources' to proceed.",
    },
    {
      num: "03",
      title: "Install & Play",
      desc: "Open your downloads folder, tap the downloaded APK file, click Install, and log into your verified casino account.",
    },
  ];

  const faqs = [
    {
      q: "Is the Jackpot Jungle APK safe to download?",
      a: "Yes. Our APK is signed and scanned for threats daily. We guarantee 100% integrity, clean code, and zero third-party tracking layers.",
    },
    {
      q: "Why is it not on the Google Play Store?",
      a: "Due to Play Store policies surrounding social gaming and sweeps promotions in certain regions, we distribute our mobile application directly as a secure standalone APK.",
    },
    {
      q: "When will the iOS/iPhone app be available?",
      a: "We are currently developing our native iOS app wrapper. It will launch on the App Store in late 2026. In the meantime, iPhone users can enjoy full gameplay by logging in through any mobile web browser.",
    },
  ];

  return (
    <PublicLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-20">
        {/* Hero Section */}
        <div className="text-center max-w-3xl mx-auto space-y-6">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="inline-flex h-14 w-14 rounded-full bg-primary/10 text-primary items-center justify-center border border-primary/20 shadow-md mb-2"
          >
            <Smartphone className="h-7 w-7" />
          </motion.div>
          <motion.h1
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="text-4xl sm:text-5xl font-extrabold tracking-tight text-foreground"
          >
            Download Jackpot Jungle
          </motion.h1>
          <motion.p
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-muted-foreground text-lg"
          >
            Get the native app on your mobile device for rapid performance, instant push notifications, and smoother sweepstakes slots gameplay.
          </motion.p>
        </div>

        {/* Download Buttons Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {/* Android */}
          <div className="p-8 rounded-3xl bg-card border border-border/60 flex flex-col justify-between shadow-xl relative overflow-hidden group hover:border-primary/40 transition-all duration-300">
            <div className="space-y-4 relative z-10">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20">
                  <span className="text-xl">🤖</span>
                </div>
                <div>
                  <h3 className="font-extrabold text-xl text-foreground">Android Client</h3>
                  <span className="text-[10px] uppercase font-bold text-emerald-400">Official APK Release</span>
                </div>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Install our official client directly on your device. Enjoy the complete social casino lobby with zero performance delays.
              </p>
              <div className="pt-2 text-xs space-y-2 border-t border-border/40 text-muted-foreground">
                <p><strong>Latest Version:</strong> v2.4.0 (Stable)</p>
                <p><strong>Size:</strong> 42.6 MB</p>
              </div>
            </div>
            <div className="pt-6 relative z-10">
              <button
                onClick={() => alert("Downloading Jackpot Jungle Android APK!")}
                className="w-full py-4 rounded-2xl font-extrabold text-sm bg-primary text-primary-foreground hover:opacity-90 transition-all shadow-lg hover:shadow-primary/20 flex items-center justify-center gap-2"
              >
                <Download className="h-4 w-4" />
                <span>Download Android APK</span>
              </button>
            </div>
          </div>

          {/* iOS iPhone */}
          <div className="p-8 rounded-3xl bg-card border border-border/40 flex flex-col justify-between shadow-xl opacity-80 relative overflow-hidden">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center border border-purple-500/20">
                  <span className="text-xl">🍏</span>
                </div>
                <div>
                  <h3 className="font-extrabold text-xl text-foreground">iOS / iPhone</h3>
                  <span className="text-[10px] uppercase font-bold text-purple-400">Coming Soon</span>
                </div>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Our native Apple App Store client wrapper is under active development. Registered players can continue utilizing the fully functional Safari web client version.
              </p>
              <div className="pt-2 text-xs space-y-2 border-t border-border/40 text-muted-foreground">
                <p><strong>Expected Release:</strong> Late 2026</p>
                <p><strong>Compatibility:</strong> iOS 15.0+</p>
              </div>
            </div>
            <div className="pt-6">
              <button
                disabled
                className="w-full py-4 rounded-2xl font-bold text-sm bg-secondary text-muted-foreground border border-border/60 flex items-center justify-center gap-2 cursor-not-allowed"
              >
                <span>App Store Launching Soon</span>
              </button>
            </div>
          </div>
        </div>

        {/* Installation Steps */}
        <div className="space-y-8 max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-foreground text-center">Easy Installation Guide</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {installationSteps.map((step) => (
              <div key={step.num} className="p-6 rounded-3xl bg-secondary/10 border border-border/40 space-y-3 relative shadow-inner">
                <span className="text-4xl font-black text-primary/20 block">{step.num}</span>
                <h4 className="font-bold text-base text-foreground">{step.title}</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Tech Specs */}
        <div className="bg-secondary/20 border border-border/40 rounded-3xl p-8 sm:p-12 max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
          <div className="space-y-4">
            <h3 className="text-2xl font-extrabold text-foreground flex items-center gap-2">
              <Cpu className="h-6 w-6 text-primary" />
              <span>System Requirements</span>
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              We design our applications to be lightweight and performant. Jackpot Jungle runs smoothly on all modern hardware.
            </p>
          </div>
          <div className="space-y-2.5 text-xs sm:text-sm">
            <div className="flex items-center gap-2.5">
              <Check className="h-4.5 w-4.5 text-emerald-500" />
              <span className="text-muted-foreground"><strong>OS:</strong> Android 7.0 (Nougat) or newer</span>
            </div>
            <div className="flex items-center gap-2.5">
              <Check className="h-4.5 w-4.5 text-emerald-500" />
              <span className="text-muted-foreground"><strong>RAM:</strong> 2 GB Minimum (4 GB Recommended)</span>
            </div>
            <div className="flex items-center gap-2.5">
              <Check className="h-4.5 w-4.5 text-emerald-500" />
              <span className="text-muted-foreground"><strong>Storage:</strong> 150 MB free space</span>
            </div>
            <div className="flex items-center gap-2.5">
              <Check className="h-4.5 w-4.5 text-emerald-500" />
              <span className="text-muted-foreground"><strong>Network:</strong> 3G/4G/5G or WiFi connection</span>
            </div>
          </div>
        </div>

        {/* Release Notes */}
        <div className="max-w-4xl mx-auto space-y-6">
          <h2 className="text-2xl font-bold text-foreground text-center">Latest Release Notes</h2>
          <div className="p-6 rounded-3xl bg-card border border-border/50 shadow-md space-y-4 text-xs sm:text-sm text-muted-foreground leading-relaxed">
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <span className="font-bold text-foreground">v2.4.0 Update Release Notes</span>
              <span className="text-[10px] uppercase font-bold text-primary">Released June 25, 2026</span>
            </div>
            <ul className="list-disc pl-5 space-y-2">
              <li>Improved sweepstakes coin progression animation speed.</li>
              <li>Fixed audio call connectivity errors on native mobile clients.</li>
              <li>Optimized background database sync to decrease battery usage.</li>
              <li>Updated Capacitor core integrations to ensure system compliance.</li>
            </ul>
          </div>
        </div>

        {/* FAQs */}
        <div className="max-w-3xl mx-auto space-y-6">
          <h2 className="text-2xl font-bold text-foreground text-center">Frequently Asked Questions</h2>
          <div className="space-y-4">
            {faqs.map((faq, idx) => {
              const isOpen = activeFaq === idx;
              return (
                <div key={idx} className="border border-border/60 rounded-2xl bg-card shadow-sm overflow-hidden">
                  <button
                    onClick={() => setActiveFaq(isOpen ? null : idx)}
                    className="w-full p-5 flex items-center justify-between font-bold text-sm sm:text-base text-foreground text-left hover:bg-secondary/40 transition-colors"
                  >
                    <span>{faq.q}</span>
                    <HelpCircle className={`h-4 w-4 shrink-0 transition-transform ${isOpen ? "rotate-180 text-primary" : "text-muted-foreground"}`} />
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-5 pt-1 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
