#!/usr/bin/env bash
set -euo pipefail
cd android
./gradlew --no-daemon :app:assembleDebug :app:assembleDebugAndroidTest
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb install -r app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
mkdir -p ../artifacts/play-store/screenshots/validation
adb shell pm clear com.fala.app
adb shell am instrument -w -e class com.fala.app.SupportDiagnosticsTest,com.fala.app.PhrasePlaybackTest com.fala.app.test/androidx.test.runner.AndroidJUnitRunner | tee ../artifacts/play-store/screenshots/validation/support-and-playback-test.log
if ! grep -q 'OK (3 tests)' ../artifacts/play-store/screenshots/validation/support-and-playback-test.log; then exit 1; fi
adb shell am instrument -w -e class com.fala.app.SpeechReleaseTest com.fala.app.test/androidx.test.runner.AndroidJUnitRunner | tee ../artifacts/play-store/screenshots/validation/speech-release-test.log
if ! grep -q 'OK (6 tests)' ../artifacts/play-store/screenshots/validation/speech-release-test.log; then exit 1; fi
adb shell am instrument -w -e class com.fala.app.PlaybackRecoveryTest com.fala.app.test/androidx.test.runner.AndroidJUnitRunner | tee ../artifacts/play-store/screenshots/validation/playback-recovery-test.log
if ! grep -q 'OK (5 tests)' ../artifacts/play-store/screenshots/validation/playback-recovery-test.log; then exit 1; fi
adb pull /sdcard/Android/data/com.fala.app/files/playback-help ../artifacts/play-store/screenshots/validation/
adb shell settings put global sysui_demo_allowed 1
adb shell am broadcast -a com.android.systemui.demo -e command clock -e hhmm 1000
adb shell am broadcast -a com.android.systemui.demo -e command battery -e level 100 -e plugged false
for device in phone seven-inch ten-inch; do
  case "$device" in
    phone) size=1080x1920; density=420;;
    seven-inch) size=1080x1920; density=280;;
    ten-inch) size=1920x1080; density=240;;
  esac
  adb shell wm size "$size"
  adb shell wm density "$density"
  adb shell pm clear com.fala.app
  adb shell am instrument -w -e class com.fala.app.StoreScreenshots -e device "$device" com.fala.app.test/androidx.test.runner.AndroidJUnitRunner | tee "../artifacts-capture-$device.log"
  if ! grep -q 'OK (1 test)' "../artifacts-capture-$device.log"; then exit 1; fi
  adb shell am instrument -w -e class com.fala.app.WalkthroughTest com.fala.app.test/androidx.test.runner.AndroidJUnitRunner | tee "../artifacts-walkthrough-$device.log"
  mkdir -p "../artifacts/play-store/screenshots/$device"
  adb pull /sdcard/Android/data/com.fala.app/files/store-screenshots/. "../artifacts/play-store/screenshots/$device/"
  cp "../artifacts-walkthrough-$device.log" "../artifacts/play-store/screenshots/$device/walkthrough-test.log"
  if ! grep -q 'OK (1 test)' "../artifacts-walkthrough-$device.log"; then exit 1; fi
done
