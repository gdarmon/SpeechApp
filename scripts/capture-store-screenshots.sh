#!/usr/bin/env bash
set -euo pipefail
cd android
./gradlew --no-daemon :app:assembleDebug :app:assembleDebugAndroidTest
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb install -r app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
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
  mkdir -p "../artifacts/play-store/screenshots/$device"
  adb pull /sdcard/Android/data/com.fala.app/files/store-screenshots/. "../artifacts/play-store/screenshots/$device/"
done
