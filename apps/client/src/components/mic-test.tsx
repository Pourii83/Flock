// Microphone check in Settings (web and the Windows app): a live level meter, so people can see that
// Flock hears them before they join a call. The sound stays on this device; nothing is recorded or sent.
import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, View } from "react-native";

import { num, t } from "@/lib/i18n";
import { saveDevice, savedDevice } from "@/state/calls";
import { colors, radius } from "@/theme";
import { ContextMenu } from "./context-menu";
import { Button, Icon, T } from "./ui";

const SEGMENTS = 20;
/** Quieter than this (dBFS) shows as silence; 0 dBFS fills the meter. */
const FLOOR_DB = -60;

export const micTestSupported =
  Platform.OS === "web" &&
  typeof window !== "undefined" &&
  !!navigator.mediaDevices?.getUserMedia &&
  typeof (window as any).AudioContext !== "undefined";

type Session = {
  stream: MediaStream;
  ctx: AudioContext;
  timer: ReturnType<typeof setInterval>;
};
type Mic = { id: string; label: string };

/** The microphones the browser lists (names only appear once the mic has been allowed). */
async function listMics(): Promise<Mic[]> {
  const all = await navigator.mediaDevices.enumerateDevices();
  return all
    .filter(
      (d) =>
        d.kind === "audioinput" &&
        d.deviceId &&
        d.deviceId !== "communications",
    )
    .map((d, i) => ({
      id: d.deviceId,
      label: d.label || t("Microphone {n}", { n: num(i + 1) }),
    }));
}

export function MicTest() {
  const [mics, setMics] = useState<Mic[]>([]);
  // The same choice calls use (state/calls.tsx): pick it here, and the next call opens this mic.
  const [micId, setMicId] = useState(() => savedDevice("input"));
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  const [running, setRunning] = useState(false);
  const [level, setLevel] = useState(0);
  const [device, setDevice] = useState("");
  const [error, setError] = useState("");
  const session = useRef<Session | null>(null);

  const stop = () => {
    const s = session.current;
    session.current = null;
    if (s) {
      clearInterval(s.timer);
      s.stream.getTracks().forEach((track) => track.stop());
      void s.ctx.close().catch(() => {});
    }
    setRunning(false);
    setLevel(0);
  };

  // The list, and again whenever a mic is plugged in or out.
  useEffect(() => {
    let alive = true;
    const refresh = () =>
      void listMics().then(
        (list) => alive && setMics(list),
        () => {},
      );
    refresh();
    navigator.mediaDevices.addEventListener?.("devicechange", refresh);
    return () => {
      alive = false;
      navigator.mediaDevices.removeEventListener?.("devicechange", refresh);
    };
  }, []);

  // Leaving Settings turns the microphone off.
  useEffect(
    () => () => {
      const s = session.current;
      if (!s) return;
      clearInterval(s.timer);
      s.stream.getTracks().forEach((track) => track.stop());
      void s.ctx.close().catch(() => {});
    },
    [],
  );

  const start = async (deviceId = micId) => {
    setError("");
    try {
      // The same processing a call uses, so the meter shows what the others would hear.
      const processing = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      };
      const stream = await navigator.mediaDevices.getUserMedia({
        audio:
          deviceId && deviceId !== "default"
            ? { ...processing, deviceId: { exact: deviceId } }
            : processing,
      });
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      // A timer, not requestAnimationFrame: frames stop in windows that aren't painted.
      const timer = setInterval(() => {
        analyser.getFloatTimeDomainData(samples);
        let sum = 0;
        for (const v of samples) sum += v * v;
        const db = 20 * Math.log10(Math.sqrt(sum / samples.length) || 1e-8);
        const next = Math.max(0, Math.min(1, (db - FLOOR_DB) / -FLOOR_DB));
        // Rise at once, fall gently, like a hardware meter.
        setLevel((prev) => (next > prev ? next : prev * 0.85 + next * 0.15));
      }, 50);
      session.current = { stream, ctx, timer };
      setDevice(stream.getAudioTracks()[0]?.label ?? "");
      setRunning(true);
      // Allowed now: the list can show real names.
      void listMics().then(setMics, () => {});
    } catch (e: any) {
      setError(
        e?.name === "NotAllowedError"
          ? t(
              "Flock isn’t allowed to use the microphone. Allow it in the browser’s site settings.",
            )
          : e?.name === "NotFoundError"
            ? t("No microphone found.")
            : t("Couldn’t open the microphone."),
      );
    }
  };

  const pick = (id: string) => {
    setMenuAt(null);
    setMicId(id);
    saveDevice("input", id);
    // Switch the running test over to the new mic at once.
    if (session.current) {
      stop();
      void start(id);
    }
  };

  const current =
    mics.find((m) => m.id === micId) ??
    mics.find((m) => m.id === "default") ??
    mics[0];
  const lit = Math.round(level * SEGMENTS);
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <T variant="labelLg">{t("Microphone test")}</T>
          <T variant="bodySm" color={colors.textMuted} numberOfLines={1}>
            {running
              ? device || t("Default microphone")
              : t("Check that Flock hears you before a call.")}
          </T>
        </View>
        <Button
          title={running ? t("Stop") : t("Test mic")}
          icon={running ? "square" : "mic"}
          size="sm"
          variant={running ? "ghost" : "primary"}
          onPress={running ? stop : () => void start()}
        />
      </View>
      {/* Before the mic is allowed the browser lists no microphones: the first press asks for it. */}
      {
        <Pressable
          onPress={(event: any) => {
            if (!mics.length) {
              void start();
              return;
            }
            const n = event?.nativeEvent ?? {};
            setMenuAt({
              x: n.pageX ?? n.clientX ?? 24,
              y: n.pageY ?? n.clientY ?? 120,
            });
          }}
          accessibilityRole="button"
          accessibilityLabel={t("Microphone")}
          style={({ hovered }: any) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderRadius: radius.lg,
            backgroundColor: hovered ? colors.surfaceHigh : colors.canvas,
            borderWidth: 1,
            borderColor: colors.surfaceHigh,
          })}
        >
          <Icon name="mic" size={16} color={colors.textMuted} />
          <T variant="body" numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
            {current?.label ?? t("Default microphone")}
          </T>
          <Icon name="chevron-down" size={16} color={colors.textMuted} />
        </Pressable>
      }
      <ContextMenu
        point={menuAt}
        title={t("Microphone")}
        items={mics.map((m) => ({
          icon: m.id === current?.id ? "check" : "mic",
          label: m.label,
          onPress: () => pick(m.id),
        }))}
        onClose={() => setMenuAt(null)}
      />
      {running && (
        <View
          style={{
            gap: 8,
            padding: 12,
            borderRadius: radius.lg,
            backgroundColor: colors.canvas,
            borderWidth: 1,
            borderColor: colors.surfaceHigh,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Icon
              name="activity"
              size={14}
              color={level > 0.05 ? colors.online : colors.textMuted}
            />
            <T variant="bodySm" color={colors.textMuted}>
              {level > 0.05
                ? t("Hearing you")
                : t("Say something — the bars should move.")}
            </T>
          </View>
          <View
            style={{ flexDirection: "row", gap: 4 }}
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: SEGMENTS, now: lit }}
          >
            {Array.from({ length: SEGMENTS }, (_, i) => {
              const on = i < lit;
              const tone =
                i >= SEGMENTS * 0.85
                  ? colors.danger
                  : i >= SEGMENTS * 0.6
                    ? colors.amber
                    : colors.online;
              return (
                <View
                  key={i}
                  style={{
                    flex: 1,
                    height: 12,
                    borderRadius: 3,
                    backgroundColor: on ? tone : colors.surfaceHigh,
                  }}
                />
              );
            })}
          </View>
        </View>
      )}
      {!!error && (
        <T variant="bodySm" color={colors.danger}>
          {error}
        </T>
      )}
    </View>
  );
}
