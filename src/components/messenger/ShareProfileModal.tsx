import React, { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Avatar } from "@/components/messenger/Avatar";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Copy, Download, Share2, Loader2 } from "lucide-react";

interface ShareProfileModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  memberSince?: string;
}

export function ShareProfileModal({
  isOpen,
  onOpenChange,
  username,
  displayName,
  avatarUrl,
  memberSince,
}: ShareProfileModalProps) {
  const [qrCodeUrl, setQrCodeUrl] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);

  const cleanUsername = username.replace(/^@/, "");
  const profileUrl = typeof window !== "undefined"
    ? `${window.location.origin}/app/u/${cleanUsername}`
    : `https://chat.playjackpotjungle.com/app/u/${cleanUsername}`;

  useEffect(() => {
    if (!isOpen) return;

    let active = true;
    setLoading(true);

    QRCode.toDataURL(
      profileUrl,
      {
        width: 512,
        margin: 2,
        color: {
          dark: "#0a0a0a", // Slate-950 color for high contrast scan
          light: "#ffffff",
        },
      },
      (err, url) => {
        if (err) {
          console.error("Failed to generate QR Code", err);
          toast.error("Failed to generate QR Code");
          return;
        }
        if (active) {
          setQrCodeUrl(url);
          setLoading(false);
        }
      }
    );

    return () => {
      active = false;
    };
  }, [isOpen, profileUrl]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(profileUrl);
    toast.success("Profile link copied.");
  };

  const handleDownloadQR = () => {
    if (!qrCodeUrl) return;
    const link = document.createElement("a");
    link.href = qrCodeUrl;
    // Format: JackpotJungle-DisplayName-Profile.png
    const sanitizedDisplayName = displayName.replace(/[^a-zA-Z0-9]/g, "");
    link.download = `JackpotJungle-${sanitizedDisplayName || cleanUsername}-Profile.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("QR Code downloaded.");
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${displayName}'s Profile`,
          text: `Chat with me on Jackpot Jungle! Username: @${cleanUsername}`,
          url: profileUrl,
        });
      } catch (err: any) {
        if (err.name !== "AbortError") {
          handleCopyLink();
        }
      }
    } else {
      handleCopyLink();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-[24px] border border-border/80 bg-card/95 backdrop-blur-xl p-6 shadow-2xl animate-in zoom-in-95 duration-200">
        <DialogHeader className="text-center sm:text-center flex flex-col items-center">
          <DialogTitle className="text-lg font-bold text-foreground">Share Profile</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground mt-0.5">
            Let others scan or visit your profile link to add you instantly
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center py-4 space-y-4">
          {/* Animated QR Code container */}
          <div className="relative h-44 w-44 rounded-2xl bg-white p-2 border border-border/50 shadow-inner flex items-center justify-center overflow-hidden transition-all duration-300 hover:scale-[1.03]">
            {loading ? (
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            ) : (
              <img
                src={qrCodeUrl}
                alt="QR Code"
                className="h-full w-full object-contain animate-in fade-in zoom-in duration-300"
              />
            )}
          </div>

          {/* User Details Preview */}
          <div className="flex flex-col items-center text-center space-y-1">
            <Avatar name={displayName} url={avatarUrl} size={48} className="shadow-md border border-border/20" />
            <h3 className="font-bold text-sm text-foreground mt-1.5">{displayName}</h3>
            <p className="text-xs text-muted-foreground font-semibold">@{cleanUsername}</p>
            {memberSince && (
              <p className="text-[10px] text-muted-foreground/80">
                Member since {new Date(memberSince).toLocaleDateString()}
              </p>
            )}
          </div>

          {/* Share Link Preview card */}
          <div className="w-full flex items-center justify-between gap-2 p-2.5 rounded-xl bg-secondary/50 border border-border/40 select-none">
            <p className="text-xs font-mono font-medium text-muted-foreground truncate max-w-[200px] pl-1">
              {profileUrl}
            </p>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground shrink-0"
              onClick={handleCopyLink}
              title="Copy Link"
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Action Buttons Footer */}
        <div className="flex gap-2">
          <Button
            onClick={handleDownloadQR}
            disabled={loading}
            variant="outline"
            className="flex-1 rounded-xl h-11 text-xs font-bold gap-1.5 border border-border/60 hover:bg-secondary/80"
          >
            <Download className="h-4 w-4" />
            <span>Download</span>
          </Button>
          <Button
            onClick={handleNativeShare}
            className="flex-1 rounded-xl h-11 text-xs font-bold gap-1.5 bg-primary text-primary-foreground hover:opacity-90 shadow-md shadow-primary/10"
          >
            <Share2 className="h-4 w-4" />
            <span>{navigator.share ? "Share" : "Copy Link"}</span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
