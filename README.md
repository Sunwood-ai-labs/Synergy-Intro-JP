# Synergy Intro JP

<div align="center">
  <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white" alt="Tailwind CSS" />
  <br />
  <img src="https://img.shields.io/badge/Google%20GenAI%20SDK-8E75B2?style=for-the-badge&logo=google&logoColor=white" alt="Google GenAI SDK" />
  <img src="https://img.shields.io/badge/Gemini_API-4285F4?style=for-the-badge&logo=google&logoColor=white" alt="Gemini API" />
</div>

会議の雰囲気を一変させる、Gemini搭載の音声イントロダクション生成アプリです。

## 概要

Synergy Intro JPは、退屈になりがちなオンライン会議やプレゼンテーションの開始時を、映画の予告編やラジオDJ、インフルエンサーなどのスタイルで劇的に演出するためのツールです。Googleの最新AIモデル「Gemini」を使用し、入力されたテキストを魅力的な台本に書き換え、高品質な音声で読み上げます。

## 主な機能

### 🎭 多彩な演出スタイル
以下のプリセットスタイルから選択できます：
*   **映画の予告編:** 重厚で壮大なナレーション。
*   **ラジオDJ:** エネルギッシュでハイテンションな朝の番組風。
*   **美容系インフルエンサー:** 親近感のある、今どきの若者言葉。
*   **ポッドキャスター:** 知的で落ち着いた語り口。
*   **ASMRプロ:** ささやき声でリラックスした雰囲気。
*   **CEOサンタ:** 陽気で力強い、クリスマスのサプライズ。

### ✨ AIによるテキスト演出 (Dramatize)
「✨ 演出を加える」ボタンをクリックすると、Gemini 2.5 Flash モデルが選択したペルソナに合わせて、入力したテキストを自動的に書き換えます。単なる読み上げではなく、感情や抑揚を意識した台本が生成されます。

### 🗣️ 高品質な音声合成 (TTS)
Gemini 2.5 Flash Preview TTS モデルを使用し、日本語特有のイントネーションや感情表現を含んだ音声を生成します。

### ⚙️ カスタマイズ
*   **カスタムスタイル:** 独自のシステムプロンプトを作成し、自分だけのナレーターを設定できます。
*   **ボイス選択:** 性別やスタイル（「柔らかい」「断固とした」「興奮しやすい」など）に基づいて、最適なボイスを選択可能です。



## 使い方

1.  **スタイルの選択:** 左側のサイドバーから好みのスタイルをクリックします。
2.  **テキストの入力:** 画面中央のテキストエリアに、会議の導入や発表したい内容を入力します。
3.  **演出の適用 (オプション):** 「✨ 演出を加える」ボタンを押すと、AIがテキストをより魅力的に書き直します。
4.  **再生:** 再生ボタン（▶）を押すと、音声が生成され再生されます。
5.  **ダウンロード:** 気に入った音声は「ダウンロード」ボタンで.wavファイルとして保存できます。

## 注意事項

このアプリケーションを利用するには、有効な Google Gemini API キーが必要です。