# Public home and product film

The public home is available at `/` and `/#/home`, including for signed-in users. The login page is `/#/login`; the dashboard is `/#/workspace`. Existing protected feature URLs retain their server authorization. School session failure does not prevent viewing the public home. Public navigation offers real sign-in and an explanatory film, with no shared demonstration account.

## Media

`public/media/tour-ar.mp4` and `tour-en.mp4` and matching `.webm` files are actual H.264/AAC and VP9/Opus films with synthetic narration at 1280×720, 30 fps. Matching JPEG posters and WebVTT captions are local static assets. The story follows one explicitly illustrative mathematics assignment through class setup, teacher publication, student submission, teacher feedback and the returned result. Screens are designed UI illustrations of these supported workflows, not recordings of live school accounts. No student records, school statistics or real identities appear in the film. A localized transcript remains available if video cannot play. WebM is offered first for browsers without proprietary codec support, with MP4 as a fallback. Video uses native accessible controls, captions, seeking, volume and fullscreen; no autoplay. Switching language replaces the video and stops the previous narration.

The site does not call a speech API during playback. Video has `preload="none"`, loads on demand and is served with ordinary HTTP range support. Decorative animation can be paused separately and follows the operating system's reduced-motion setting. Reduced motion does not prevent the user from explicitly playing a video.

## Edit and regenerate

Narration beats, scene headings and interface labels are centralized in `src/shared/tour-content.json`; home interface copy is in `src/client/i18n/home.ts`. The frontend transcript and renderer use the same narration source. Each short spoken beat has its own visual state; caption timing comes from synthesis sentence boundaries, with each cue ending by the next sentence start to avoid provider timing overlaps. Chapter offsets are calculated from rendered audio durations and emitted into `src/shared/tour-timeline.json`. The player can seek directly to the four workflow steps. Asset URLs include a content revision so older cached films are replaced. Update both language versions together.

Rendering is an optional authoring step, not a production dependency. Requires Python 3, Pillow with RAQM support for Arabic shaping, edge-tts, FFmpeg with `libopenh264`, AAC, `libvpx-vp9` and `libopus`, ffprobe, and the bundled IBM Plex Sans Arabic fonts (including Latin glyphs), licensed under the SIL Open Font License in `assets/film-fonts/OFL.txt`. The original generation used Pillow 11.3.0 and edge-tts 7.2.8. Microsoft Edge speech synthesis is contacted only while generating the original media, using the public product narration; no school data or credentials are sent. Regeneration requires network access to that authoring service.

```sh
python3 -m venv /tmp/claso-media-env
/tmp/claso-media-env/bin/pip install Pillow==11.3.0 edge-tts==7.2.8
/tmp/claso-media-env/bin/python scripts/media/render-tour.py
npm run build
```

`scripts/media/storyboard.py` draws the persistent class/assignment workspace, role changes, typing, pointer actions, status changes and chapter progress. Related states dissolve into each other while preserving object placement. The renderer stages both languages and both codecs before replacing playback assets, and stops on synthesis/encoding failures. It caches narration by text/voice hash under the temporary directory by default; set `CLASO_NARRATION_CACHE` to retain the cache elsewhere. Only public product copy is cached.

To review composition before a full render:

```sh
/tmp/claso-media-env/bin/python scripts/media/render-tour.py --preview /tmp/claso-storyboard.png
```

Use `--captions-only` to regenerate captions from cached narration without encoding video again. This checks that the audio duration and chapter offsets match the existing film before publishing captions.

Playback assets are written to `public/media/` and chapter metadata to `src/shared/tour-timeline.json`; commit both with their source. Production installation does not require Python, FFmpeg, speech credentials or speech-provider access. Synthetic narration is identified on the home page.

On Amazon Linux, FFmpeg 5.1 may specifically load `libopenh264.so.7`. The available OS package supplies `.so.8` and is insufficient for that build. Use the matching Cisco OpenH264 2.3.1 binary in a private library directory with `LD_LIBRARY_PATH`, or a compatible FFmpeg build. Do not rename a different ABI version. This requirement applies only to media authoring.

## English editorial cut

The home player starts with English narration independently of the interface language. A separate narration selector retains the Arabic version. The English cut uses short directional match cuts, restrained camera moves around the persistent assignment and a four-shot closing montage followed by the brand lockup. These illustrations contain no imported school identities. To re-render only this version while preserving Arabic assets, use `--locale en`; chapter metadata for the other language is retained.
