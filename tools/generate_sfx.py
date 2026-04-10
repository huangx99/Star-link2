#!/usr/bin/env python3
import math
import random
import struct
import wave
from pathlib import Path

SAMPLE_RATE = 22050
MASTER_GAIN = 0.72
SEED = 42042


def clamp(value, low=-1.0, high=1.0):
    return max(low, min(high, value))


def apply_envelope(samples, attack=0.008, decay=0.08, sustain=0.55, release=0.12):
    total = len(samples)
    if total <= 0:
        return []

    attack_len = max(1, int(total * attack))
    decay_len = max(1, int(total * decay))
    release_len = max(1, int(total * release))
    sustain_end = max(attack_len + decay_len, total - release_len)
    shaped = []

    for index, sample in enumerate(samples):
        if index < attack_len:
            amp = index / attack_len
        elif index < attack_len + decay_len:
            local = (index - attack_len) / decay_len
            amp = 1 - (1 - sustain) * local
        elif index < sustain_end:
            amp = sustain
        else:
            local = (index - sustain_end) / max(1, total - sustain_end)
            amp = sustain * (1 - local)
        shaped.append(sample * amp)

    return shaped


def square_wave(phase):
    return 1.0 if math.sin(phase) >= 0 else -1.0


def triangle_wave(phase):
    return (2 / math.pi) * math.asin(math.sin(phase))


def generate_tone(
    duration,
    freq_start,
    freq_end=None,
    waveform="square",
    vibrato_depth=0.0,
    vibrato_speed=0.0,
    duty_jitter=0.0,
):
    count = max(1, int(duration * SAMPLE_RATE))
    freq_end = freq_start if freq_end is None else freq_end
    samples = []
    phase = 0.0

    for index in range(count):
        t = index / max(1, count - 1)
        frequency = freq_start + (freq_end - freq_start) * t
        if vibrato_depth > 0 and vibrato_speed > 0:
            frequency += math.sin(2 * math.pi * vibrato_speed * (index / SAMPLE_RATE)) * vibrato_depth
        phase += (2 * math.pi * max(1.0, frequency)) / SAMPLE_RATE

        if waveform == "triangle":
            sample = triangle_wave(phase)
        elif waveform == "pulse":
            pulse = 0.25 + (math.sin(2 * math.pi * 2.7 * (index / SAMPLE_RATE)) * duty_jitter)
            sample = 1.0 if (phase / (2 * math.pi)) % 1.0 < pulse else -1.0
        elif waveform == "sine":
            sample = math.sin(phase)
        else:
            sample = square_wave(phase)

        samples.append(sample)

    return samples


def generate_noise(duration, step_hz=750, highpass=0.0):
    count = max(1, int(duration * SAMPLE_RATE))
    hold = max(1, int(SAMPLE_RATE / max(1, step_hz)))
    samples = []
    value = 0.0
    last = 0.0

    for index in range(count):
        if index % hold == 0:
            value = random.uniform(-1.0, 1.0)
        current = value
        if highpass > 0:
            current = current - last * highpass
            last = current
        samples.append(current)

    return samples


def mix_layers(*layers):
    total = max((len(layer) for layer in layers), default=0)
    mixed = []

    for index in range(total):
        value = 0.0
        for layer in layers:
            if index < len(layer):
                value += layer[index]
        mixed.append(clamp(value))

    return mixed


def normalize(samples, peak=0.9):
    max_value = max((abs(sample) for sample in samples), default=1.0)
    if max_value <= 0:
        return samples
    scale = peak / max_value
    return [sample * scale for sample in samples]


def write_wav(path, samples):
    path.parent.mkdir(parents=True, exist_ok=True)
    pcm = bytearray()

    for sample in samples:
        value = int(clamp(sample * MASTER_GAIN) * 32767)
        pcm.extend(struct.pack("<h", value))

    with wave.open(str(path), "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(SAMPLE_RATE)
        wav_file.writeframes(pcm)


def sequence(parts):
    joined = []
    for part in parts:
        joined.extend(part)
    return joined


def silence(duration):
    return [0.0] * max(1, int(duration * SAMPLE_RATE))


def make_ui_hover():
    tone = generate_tone(0.08, 760, 980, waveform="square", vibrato_depth=8, vibrato_speed=18)
    return normalize(apply_envelope(tone, attack=0.02, decay=0.25, sustain=0.42, release=0.18))


def make_ui_confirm():
    first = apply_envelope(generate_tone(0.07, 640, 840, waveform="pulse", duty_jitter=0.08))
    second = apply_envelope(generate_tone(0.11, 920, 1240, waveform="square"), attack=0.01, decay=0.18, sustain=0.5, release=0.22)
    return normalize(sequence([first, silence(0.02), second]))


def make_ui_cancel():
    tone = generate_tone(0.14, 720, 320, waveform="triangle", vibrato_depth=10, vibrato_speed=12)
    return normalize(apply_envelope(tone, attack=0.01, decay=0.18, sustain=0.36, release=0.32))


def make_card_pickup():
    tone = generate_tone(0.09, 540, 900, waveform="square", vibrato_depth=5, vibrato_speed=24)
    click = apply_envelope(generate_noise(0.03, step_hz=3200), attack=0.01, decay=0.5, sustain=0.1, release=0.38)
    return normalize(mix_layers(apply_envelope(tone, attack=0.02, decay=0.24, sustain=0.48, release=0.14), [sample * 0.18 for sample in click]))


def make_card_play():
    whoosh = apply_envelope(generate_noise(0.12, step_hz=1900, highpass=0.25), attack=0.01, decay=0.18, sustain=0.2, release=0.5)
    tone = apply_envelope(generate_tone(0.12, 420, 240, waveform="triangle"), attack=0.01, decay=0.15, sustain=0.32, release=0.32)
    return normalize(mix_layers([sample * 0.45 for sample in whoosh], [sample * 0.65 for sample in tone]))


def make_hit_light():
    bite = apply_envelope(generate_tone(0.08, 280, 110, waveform="square"), attack=0.01, decay=0.16, sustain=0.18, release=0.5)
    grit = apply_envelope(generate_noise(0.09, step_hz=2600, highpass=0.32), attack=0.0, decay=0.22, sustain=0.08, release=0.45)
    return normalize(mix_layers([sample * 0.7 for sample in bite], [sample * 0.42 for sample in grit]))


def make_hit_heavy():
    slam = apply_envelope(generate_tone(0.16, 180, 62, waveform="square"), attack=0.0, decay=0.24, sustain=0.18, release=0.5)
    crack = apply_envelope(generate_noise(0.12, step_hz=3000, highpass=0.38), attack=0.0, decay=0.16, sustain=0.06, release=0.55)
    tail = apply_envelope(generate_tone(0.18, 96, 64, waveform="triangle"), attack=0.0, decay=0.25, sustain=0.2, release=0.55)
    return normalize(mix_layers([sample * 0.62 for sample in slam], [sample * 0.35 for sample in crack], [sample * 0.4 for sample in tail]))


def make_shield_gain():
    rise = apply_envelope(generate_tone(0.16, 320, 640, waveform="triangle"), attack=0.02, decay=0.18, sustain=0.5, release=0.22)
    chime = apply_envelope(generate_tone(0.15, 960, 820, waveform="pulse", duty_jitter=0.06), attack=0.01, decay=0.22, sustain=0.34, release=0.25)
    return normalize(mix_layers([sample * 0.68 for sample in rise], [sample * 0.28 for sample in chime]))


def make_energy_gain():
    pulse_a = apply_envelope(generate_tone(0.07, 680, 920, waveform="square"), attack=0.01, decay=0.2, sustain=0.35, release=0.18)
    pulse_b = apply_envelope(generate_tone(0.09, 920, 1280, waveform="pulse", duty_jitter=0.1), attack=0.01, decay=0.16, sustain=0.42, release=0.22)
    spark = apply_envelope(generate_noise(0.05, step_hz=4200), attack=0.0, decay=0.42, sustain=0.05, release=0.25)
    return normalize(sequence([mix_layers([sample * 0.6 for sample in pulse_a], [sample * 0.12 for sample in spark]), silence(0.018), mix_layers([sample * 0.64 for sample in pulse_b], [sample * 0.1 for sample in spark])]))


def make_buff_apply():
    base = apply_envelope(generate_tone(0.18, 500, 940, waveform="triangle"), attack=0.02, decay=0.22, sustain=0.48, release=0.24)
    top = apply_envelope(generate_tone(0.12, 980, 1320, waveform="square", vibrato_depth=6, vibrato_speed=15), attack=0.01, decay=0.2, sustain=0.26, release=0.25)
    return normalize(mix_layers([sample * 0.62 for sample in base], [sample * 0.24 for sample in top]))


def make_debuff_apply():
    tone = apply_envelope(generate_tone(0.17, 520, 180, waveform="triangle"), attack=0.01, decay=0.18, sustain=0.32, release=0.34)
    hiss = apply_envelope(generate_noise(0.13, step_hz=1600, highpass=0.22), attack=0.0, decay=0.2, sustain=0.08, release=0.5)
    return normalize(mix_layers([sample * 0.6 for sample in tone], [sample * 0.2 for sample in hiss]))


def make_turn_end():
    low = apply_envelope(generate_tone(0.1, 460, 390, waveform="square"), attack=0.01, decay=0.18, sustain=0.38, release=0.22)
    high = apply_envelope(generate_tone(0.1, 690, 540, waveform="triangle"), attack=0.01, decay=0.2, sustain=0.34, release=0.25)
    return normalize(sequence([mix_layers([sample * 0.55 for sample in low], [sample * 0.28 for sample in high]), silence(0.02), apply_envelope(generate_tone(0.11, 360, 240, waveform="square"), attack=0.0, decay=0.2, sustain=0.3, release=0.3)]))


def make_boss_skill():
    growl = apply_envelope(generate_tone(0.22, 120, 92, waveform="square"), attack=0.0, decay=0.18, sustain=0.34, release=0.4)
    flare = apply_envelope(generate_tone(0.14, 460, 760, waveform="pulse", duty_jitter=0.08), attack=0.01, decay=0.16, sustain=0.3, release=0.25)
    grit = apply_envelope(generate_noise(0.11, step_hz=2200, highpass=0.28), attack=0.0, decay=0.2, sustain=0.04, release=0.45)
    return normalize(mix_layers([sample * 0.58 for sample in growl], [sample * 0.22 for sample in flare], [sample * 0.18 for sample in grit]))


SFX_BUILDERS = {
    "ui-hover.wav": make_ui_hover,
    "ui-confirm.wav": make_ui_confirm,
    "ui-cancel.wav": make_ui_cancel,
    "card-pickup.wav": make_card_pickup,
    "card-play.wav": make_card_play,
    "hit-light.wav": make_hit_light,
    "hit-heavy.wav": make_hit_heavy,
    "shield-gain.wav": make_shield_gain,
    "energy-gain.wav": make_energy_gain,
    "buff-apply.wav": make_buff_apply,
    "debuff-apply.wav": make_debuff_apply,
    "turn-end.wav": make_turn_end,
    "boss-skill.wav": make_boss_skill,
}


def main():
    random.seed(SEED)
    root = Path(__file__).resolve().parent.parent / "assets" / "audio" / "sfx"

    for filename, builder in SFX_BUILDERS.items():
        samples = builder()
        write_wav(root / filename, samples)

    print(f"Generated {len(SFX_BUILDERS)} sfx files in {root}")


if __name__ == "__main__":
    main()
