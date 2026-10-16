# Android-Only Application Rule

This application (Goa-SolarTrack) is built and targeted EXCLUSIVELY for **Android**.

## Rules & Guidelines:
1. **No iOS checks**: Do not write `Platform.OS === 'ios'` or add iOS-specific fallbacks/ternaries anywhere in the codebase.
2. **Android UI & Insets**:
   - Always prioritize Android display units, Android navigation bar safe area insets, and standard Android layout behavior.
   - For bottom sheets and modals, use Android insets: `Math.max(insets.bottom, 14)` without iOS ternaries.
   - For keyboards, Android uses standard soft input adjustments (`adjustResize`), so avoid iOS `behavior="padding"` on `KeyboardAvoidingView`.
3. **File Picking & Native APIs**:
   - Use Android file picker types (e.g. `'*/*'` or standard Android MIME types) without iOS branching.
