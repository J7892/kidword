let cachedVoices: SpeechSynthesisVoice[] = [];
let listenerAttached = false;

function refreshVoices(): SpeechSynthesisVoice[] {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return [];
  }
  const voices = window.speechSynthesis.getVoices();
  if (voices.length > 0) {
    cachedVoices = voices;
  }
  if (!listenerAttached) {
    listenerAttached = true;
    window.speechSynthesis.addEventListener('voiceschanged', () => {
      const next = window.speechSynthesis.getVoices();
      if (next.length > 0) {
        cachedVoices = next;
      }
    });
  }
  return cachedVoices;
}

function scoreVoice(voice: SpeechSynthesisVoice, online: boolean): number {
  const lang = voice.lang.toLowerCase();
  if (!lang.startsWith('en')) return -1000;

  // Skip cloud-only voices when offline so speech never fails silently
  if (!online && !voice.localService) return -500;

  const name = voice.name.toLowerCase();
  let score = 0;

  if (name.includes('natural') || name.includes('neural')) {
    score += 100;
  }
  if (name.includes('google')) {
    score += 60;
  }
  if (
    name.includes('samantha') ||
    name.includes('ava') ||
    name.includes('aria') ||
    name.includes('jenny') ||
    name.includes('emma') ||
    name.includes('clara') ||
    name.includes('liam')
  ) {
    score += 30;
  }

  if (lang === 'en-ca' || lang === 'en_ca') {
    score += 25;
  } else if (lang === 'en-us' || lang === 'en_us') {
    score += 15;
  } else if (lang === 'en-gb' || lang === 'en_gb') {
    score += 10;
  }

  if (online && !voice.localService) {
    score += 10;
  }

  if (name.includes('espeak') || name.includes('compact')) {
    score -= 40;
  }

  return score;
}

export function pickBestEnglishVoice(): SpeechSynthesisVoice | null {
  const voices = refreshVoices();
  if (voices.length === 0) return null;

  const online = typeof navigator !== 'undefined' ? navigator.onLine : true;
  let best: SpeechSynthesisVoice | null = null;
  let bestScore = -999;

  for (const voice of voices) {
    const score = scoreVoice(voice, online);
    if (score > bestScore) {
      bestScore = score;
      best = voice;
    }
  }

  return best;
}

export function speakWordNaturally(word: string): SpeechSynthesisUtterance | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return null;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(word);
  const voice = pickBestEnglishVoice();
  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang;
  } else {
    utterance.lang = 'en-CA';
  }
  utterance.rate = 0.92;
  utterance.pitch = 1.0;
  window.speechSynthesis.speak(utterance);
  return utterance;
}
