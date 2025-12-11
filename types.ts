/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
export interface IntroStyle {
  id: string;
  name: string;
  description: string;
  defaultVoice: string; // Gemini voice name
  templateText: string;
  color: 'red' | 'blue' | 'yellow' | 'white' | 'green' | 'black';
  icon: 'circle' | 'square' | 'triangle' | 'half-circle' | 'rect' | 'plus';
  avatarSrc?: string; // Path to avatar image
  audioSrc?: string; // Path to pre-generated audio file
}

export interface VoiceOption {
  name: string;
  ssmlGender: string;
}