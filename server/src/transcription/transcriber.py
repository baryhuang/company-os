#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
Transcription module for generating and processing transcripts from audio/video files.
Uses AssemblyAI for transcription with speaker diarization.
"""

import os
import json
import time
import logging
from pathlib import Path
from typing import List, Dict, Any, Optional

import assemblyai as aai
import zhconv
from tqdm import tqdm
from moviepy.video.io.VideoFileClip import VideoFileClip
from moviepy.audio.io.AudioFileClip import AudioFileClip

from server.src.models.transcription import TranscriptionSegment

logger = logging.getLogger(__name__)

def transcribe_video(video_path: str, language_code: Optional[str] = None, force_overwrite: bool = False) -> List[TranscriptionSegment]:
    """
    Transcribe an audio/video file using AssemblyAI with speaker diarization.
    Caches results to a .transcript.json file alongside the input.

    Args:
        video_path: Path to the audio or video file
        language_code: Language code (e.g., 'en', 'zh'). If None, uses auto-detection.
        force_overwrite: If True, overwrite existing transcript files

    Returns:
        List of TranscriptionSegment objects
    """
    video_path_obj = Path(video_path)
    transcript_path = video_path_obj.with_suffix('.transcript.json')

    # Return cached transcript if available
    if transcript_path.exists() and not force_overwrite:
        logger.info(f"Loading existing transcript from {transcript_path}")
        try:
            with open(transcript_path, 'r', encoding='utf-8') as f:
                transcript_data = json.load(f)
            segments = [
                TranscriptionSegment(
                    text=seg_data['text'],
                    start=seg_data['start'],
                    end=seg_data['end'],
                    words=seg_data.get('words', []),
                    speaker=seg_data.get('speaker')
                )
                for seg_data in transcript_data
            ]
            logger.info(f"Loaded {len(segments)} segments from existing transcript")
            return segments
        except Exception as e:
            logger.warning(f"Failed to load existing transcript: {e}. Will re-transcribe.")

    if force_overwrite and transcript_path.exists():
        logger.info("Force overwrite enabled - existing transcript will be replaced")

    logger.info(f"Processing file: {video_path}")

    # Extract audio to temporary WAV
    temp_audio_path = video_path_obj.with_suffix('.temp.wav')
    try:
        is_video = video_path.lower().endswith(('.mp4', '.avi', '.mov', '.mkv', '.webm'))

        if is_video:
            logger.info("Input is video, extracting audio...")
            video = VideoFileClip(video_path)
            video.audio.write_audiofile(str(temp_audio_path), codec='pcm_s16le', ffmpeg_params=["-ac", "1"])
            video.close()
        else:
            logger.info("Input is audio, converting to WAV format...")
            audio = AudioFileClip(video_path)
            audio.write_audiofile(str(temp_audio_path), codec='pcm_s16le', ffmpeg_params=["-ac", "1"])
            audio.close()

        if language_code:
            logger.info(f"Transcribing with speaker diarization (language: {language_code})...")
            config = aai.TranscriptionConfig(
                language_code=language_code,
                speaker_labels=True,
                punctuate=True,
                format_text=True
            )
        else:
            logger.info("Transcribing with speaker diarization (auto language detection)...")
            config = aai.TranscriptionConfig(
                language_detection=True,
                speaker_labels=True,
                punctuate=True,
                format_text=True
            )

        transcriber = aai.Transcriber()
        transcript = transcriber.transcribe(str(temp_audio_path), config=config)

        with tqdm(total=100, desc="Transcribing") as pbar:
            last_progress = 0
            while True:
                status = transcript.status
                if status == "queued":
                    progress = 5
                elif status == "processing":
                    progress = 50
                elif status == "completed":
                    progress = 100
                    break
                elif status == "error":
                    raise Exception(f"Transcription failed with status: {status}")
                if progress > last_progress:
                    pbar.update(progress - last_progress)
                    last_progress = progress
                time.sleep(3)

        # Process utterances
        segments = []
        detected_language = getattr(transcript, 'language_code', language_code) or 'unknown'
        logger.info(f"Transcription language: {detected_language}")
        is_chinese = detected_language.startswith('zh') if detected_language else False

        logger.info("Processing speaker diarization results...")
        for utterance in (transcript.utterances or []):
            text = zhconv.convert(utterance.text, 'zh-hant') if is_chinese else utterance.text
            segment = TranscriptionSegment(
                text=text,
                start=utterance.start / 1000,
                end=utterance.end / 1000,
                speaker=utterance.speaker,
                words=[{
                    'text': word.text,
                    'start': word.start / 1000,
                    'end': word.end / 1000
                } for word in utterance.words] if hasattr(utterance, 'words') else []
            )
            segments.append(segment)

        logger.info(f"Found {len(segments)} segments with {len(set(seg.speaker for seg in segments))} unique speakers")

        # Save transcript
        logger.info(f"Saving transcript to {transcript_path}")
        transcript_data = [
            {
                'text': seg.text,
                'start': seg.start,
                'end': seg.end,
                'speaker': seg.speaker,
                'words': seg.words
            }
            for seg in segments
        ]
        with open(transcript_path, 'w', encoding='utf-8') as f:
            json.dump(transcript_data, f, ensure_ascii=False, indent=2)

        logger.info(f"Transcription complete: {len(segments)} segments")
        return segments

    except Exception as e:
        logger.error(f"Transcription failed: {e}")
        raise

    finally:
        if temp_audio_path.exists():
            temp_audio_path.unlink()
            logger.info("Cleaned up temporary audio file")


def create_text_transcript(video_path: str, segments: List[TranscriptionSegment]) -> str:
    """
    Create a plain text transcript file from segments.

    Args:
        video_path: Path to the original file
        segments: List of transcription segments

    Returns:
        Path to the created transcript file
    """
    video_path_obj = Path(video_path)
    transcript_path = video_path_obj.with_suffix('.transcript.txt')

    sorted_segments = sorted(segments, key=lambda x: x.start)

    with open(transcript_path, 'w', encoding='utf-8') as f:
        f.write(f"Transcript for: {video_path_obj.name}\n")
        f.write("=" * 50 + "\n\n")

        current_speaker = None
        for i, seg in enumerate(sorted_segments, 1):
            timestamp = f"[{int(seg.start//60):02d}:{int(seg.start%60):02d}.{int((seg.start%1)*10):01d} - {int(seg.end//60):02d}:{int(seg.end%60):02d}.{int((seg.end%1)*10):01d}]"

            if seg.speaker != current_speaker:
                current_speaker = seg.speaker
                if i > 1:
                    f.write("\n")
                if current_speaker:
                    f.write(f"\nSpeaker {current_speaker}:\n{'-' * 20}\n")

            f.write(f"{timestamp} {seg.text}\n")

            if i % 5 == 0 and i < len(sorted_segments) and sorted_segments[i].speaker == current_speaker:
                f.write("\n")

    logger.info(f"Created plain text transcript at: {transcript_path}")
    return str(transcript_path)
