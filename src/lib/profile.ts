// Ce que cet appareil sait lire sans conversion : Jellyfin choisit ensuite entre
// lecture directe (aucune charge pour le serveur) et conversion à la volée (HLS).

const video = document.createElement('video');
const can = (type: string) => video.canPlayType(type).replace('no', '') !== '' || (window.MediaSource?.isTypeSupported?.(type) ?? false);

function videoCodecs(): string[] {
  const list = ['h264'];
  if (can('video/mp4; codecs="hvc1.1.6.L120.90"') || can('video/mp4; codecs="hev1.1.6.L120.90"')) list.push('hevc');
  if (can('video/mp4; codecs="av01.0.08M.08"')) list.push('av1');
  if (can('video/webm; codecs="vp9"')) list.push('vp9');
  return list;
}

function audioCodecs() {
  const list = ['aac', 'mp3', 'mp2'];
  if (can('audio/mp4; codecs="opus"') || can('audio/webm; codecs="opus"')) list.push('opus');
  if (can('audio/flac') || can('audio/mp4; codecs="flac"')) list.push('flac');
  if (can('audio/mp4; codecs="ac-3"')) list.push('ac3');
  if (can('audio/mp4; codecs="ec-3"')) list.push('eac3');
  return list;
}

export function deviceProfile(maxBitrate: number) {
  const v = videoCodecs();
  const a = audioCodecs();
  const mkv = can('video/x-matroska') || can('video/mkv');
  return {
    Name: 'Selvania Cine',
    MaxStreamingBitrate: maxBitrate,
    MaxStaticBitrate: 200_000_000,
    MusicStreamingTranscodingBitrate: 384_000,
    DirectPlayProfiles: [
      { Container: 'mp4,m4v,mov', Type: 'Video', VideoCodec: v.join(','), AudioCodec: a.join(',') },
      { Container: 'webm', Type: 'Video', VideoCodec: [...v.filter((c) => c === 'vp9' || c === 'av1'), 'vp8'].join(','), AudioCodec: 'vorbis,opus' },
      ...(mkv ? [{ Container: 'mkv', Type: 'Video', VideoCodec: v.join(','), AudioCodec: a.join(',') }] : []),
    ],
    TranscodingProfiles: [
      {
        Container: 'ts', Type: 'Video', Protocol: 'hls', Context: 'Streaming',
        VideoCodec: 'h264', AudioCodec: a.filter((c) => c === 'aac' || c === 'mp3' || c === 'ac3').join(','),
        MaxAudioChannels: '6', MinSegments: 1, BreakOnNonKeyFrames: true,
      },
    ],
    ContainerProfiles: [],
    CodecProfiles: [
      {
        Type: 'Video', Codec: 'h264',
        Conditions: [
          { Condition: 'LessThanEqual', Property: 'VideoLevel', Value: '52', IsRequired: false },
          { Condition: 'NotEquals', Property: 'IsAnamorphic', Value: 'true', IsRequired: false },
          { Condition: 'EqualsAny', Property: 'VideoProfile', Value: 'high|main|baseline|constrained baseline', IsRequired: false },
        ],
      },
    ],
    // Sous-titres texte : affichés par le lecteur ; sous-titres images (Blu-ray) : incrustés par le serveur.
    SubtitleProfiles: [
      { Format: 'vtt', Method: 'External' },
      { Format: 'srt', Method: 'External' },
      { Format: 'subrip', Method: 'External' },
      { Format: 'ass', Method: 'External' },
      { Format: 'ssa', Method: 'External' },
      { Format: 'pgssub', Method: 'Encode' },
      { Format: 'dvdsub', Method: 'Encode' },
      { Format: 'dvbsub', Method: 'Encode' },
    ],
  };
}

/** Débit maximal choisi dans le lecteur (Auto = laisse le serveur décider). */
export const QUALITIES = [
  { label: 'Auto', bitrate: 120_000_000 },
  { label: '1080p · 20 Mb/s', bitrate: 20_000_000 },
  { label: '1080p · 10 Mb/s', bitrate: 10_000_000 },
  { label: '720p · 4 Mb/s', bitrate: 4_000_000 },
  { label: '480p · 1,5 Mb/s', bitrate: 1_500_000 },
];
