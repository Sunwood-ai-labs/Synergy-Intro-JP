/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { GoogleGenAI, Modality } from "@google/genai";

// Initialize Gemini Client
// Note: We use process.env.API_KEY as per instructions.
const getClient = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

// Audio Decoding Helper
function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number = 24000,
  numChannels: number = 1
): Promise<AudioBuffer> {
  // Simple check for WAV header vs raw PCM.
  // Gemini TTS usually returns raw PCM, but let's be safe.
  // If it's raw PCM, we construct the buffer manually.
  
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      // Convert Int16 to Float32 [-1.0, 1.0]
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

export function createWavBlob(samples: Uint8Array, sampleRate: number = 24000): Blob {
  const buffer = new ArrayBuffer(44 + samples.length);
  const view = new DataView(buffer);
  
  // RIFF identifier
  writeString(view, 0, 'RIFF');
  // RIFF chunk length
  view.setUint32(4, 36 + samples.length, true);
  // RIFF type
  writeString(view, 8, 'WAVE');
  // format chunk identifier
  writeString(view, 12, 'fmt ');
  // format chunk length
  view.setUint32(16, 16, true);
  // sample format (1 is PCM)
  view.setUint16(20, 1, true);
  // channel count
  view.setUint16(22, 1, true);
  // sample rate
  view.setUint32(24, sampleRate, true);
  // byte rate (sample rate * block align)
  view.setUint32(28, sampleRate * 2, true);
  // block align (channel count * bytes per sample)
  view.setUint16(32, 2, true);
  // bits per sample
  view.setUint16(34, 16, true);
  // data chunk identifier
  writeString(view, 36, 'data');
  // data chunk length
  view.setUint32(40, samples.length, true);

  const dataView = new Uint8Array(buffer, 44);
  dataView.set(samples);

  return new Blob([buffer], { type: 'audio/wav' });
}

export interface GeneratedAudio {
  buffer: AudioBuffer;
  rawData: Uint8Array;
}

export const generateSpeech = async (
  text: string, 
  voiceName: string,
  styleInstruction?: string
): Promise<GeneratedAudio> => {
  const ai = getClient();
  
  const speakerName = 'Speaker';
  // Use speaker labeling to distinguish instructions from the text to be spoken.
  const fullInputText = styleInstruction 
    ? `${styleInstruction}\n\n${speakerName}: ${text}` 
    : `${speakerName}: ${text}`;

  // We need a second speaker to satisfy the API requirement of exactly 2 speakers for multiSpeakerVoiceConfig.
  // We'll use a dummy speaker that is never invoked in the text.
  const dummySpeakerName = 'Interactant'; 
  const dummyVoiceName = 'Puck'; 

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: fullInputText }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          multiSpeakerVoiceConfig: {
            speakerVoiceConfigs: [
              {
                speaker: speakerName,
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: voiceName },
                }
              },
              {
                speaker: dummySpeakerName,
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: dummyVoiceName },
                }
              }
            ]
          }
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

    if (!base64Audio) {
      throw new Error("No audio data returned from Gemini.");
    }

    const outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: 24000, 
    });

    try {
      const audioBytes = decode(base64Audio);
      const audioBuffer = await decodeAudioData(audioBytes, outputAudioContext, 24000, 1);
      
      return { buffer: audioBuffer, rawData: audioBytes };
    } finally {
      await outputAudioContext.close();
    }

  } catch (error) {
    console.error("Error generating speech:", error);
    // Log detailed error for diagnostic purposes
    if (typeof error === 'object' && error !== null) {
      console.error("Detailed Error Details:", JSON.stringify(error, null, 2));
    }
    throw error;
  }
};

export const dramatizeText = async (text: string, styleInstruction?: string): Promise<string> => {
  const ai = getClient();
  
  const persona = styleInstruction 
    ? `ペルソナ/スタイル: ${styleInstruction}` 
    : `スタイル: ドラマチックで期待感を高める会議の導入。人々の注意を引くように、魅力的で引き込まれる内容にする。`;

  try {
    const prompt = `
      このビジネス会議の導入文を、指定されたペルソナに合わせて、より魅力的で表現豊かに書き直してください。
      
      ペルソナ: ${persona}
      
      ガイドライン:
      1. **自然な会話**: ペルソナに自然なリズムと表現力を使い、流暢な語り口にする。
      2. **スタイルの制御**: 自然な言葉遣いを取り入れ、適切なトーンと表現に導く。
      3. **ダイナミックなパフォーマンス**: ペルソナに適したエネルギー（例：詩的、ニュースキャスター風、ストーリーテリング）でテキストに命を吹き込む。
      4. **ペースと発音**: 明瞭な発音と適切なペース配分が可能になるようなテキストにする。
      5. **正確性**: 核心となる事実、名前、データは正確に保つ。
      6. **フォーマット**: 書き直したテキストのみを引用符なしで返すこと。言語は日本語で出力すること。
      
      入力テキスト:
      "${text}"
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    return response.text || text;
  } catch (error) {
    console.error("Error dramatizing text:", error);
    throw error;
  }
};