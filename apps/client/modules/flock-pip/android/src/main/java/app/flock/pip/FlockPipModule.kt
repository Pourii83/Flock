package app.flock.pip

import android.app.PictureInPictureParams
import android.content.pm.PackageManager
import android.os.Build
import android.util.Rational
import androidx.activity.ComponentActivity
import androidx.core.app.PictureInPictureModeChangedInfo
import androidx.core.util.Consumer
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Picture-in-picture for calls. While a video call is on, leaving the app (Home, the recents
 * button, a gesture) shrinks it into Android's floating window instead of hiding it, like Google
 * Meet. Android 12+ does that by itself (auto-enter); older versions enter on the "user leaving"
 * hint. JS learns when the app goes in and out of the window, to show only the video there.
 */
class FlockPipModule : Module() {
  private var autoEnter = false
  private var aspect = Rational(9, 16)
  private var listening: ComponentActivity? = null
  private val onModeChanged = Consumer<PictureInPictureModeChangedInfo> { info ->
    sendEvent("onPipChange", mapOf("inPip" to info.isInPictureInPictureMode))
  }

  private fun supported(): Boolean {
    val activity = appContext.currentActivity ?: return false
    return Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
      activity.packageManager.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)
  }

  private fun params(): PictureInPictureParams? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return null
    val builder = PictureInPictureParams.Builder().setAspectRatio(aspect)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      builder.setAutoEnterEnabled(autoEnter)
      builder.setSeamlessResizeEnabled(true)
    }
    return builder.build()
  }

  /** Hands the current settings to the activity and listens for its window changes. */
  private fun apply() {
    val activity = appContext.currentActivity ?: return
    activity.runOnUiThread {
      if (!supported()) return@runOnUiThread
      val component = activity as? ComponentActivity
      if (component != null && listening !== component) {
        listening?.removeOnPictureInPictureModeChangedListener(onModeChanged)
        component.addOnPictureInPictureModeChangedListener(onModeChanged)
        listening = component
      }
      params()?.let { runCatching { activity.setPictureInPictureParams(it) } }
    }
  }

  private fun enter(): Boolean {
    val activity = appContext.currentActivity ?: return false
    if (!supported()) return false
    val p = params() ?: return false
    return runCatching { activity.enterPictureInPictureMode(p) }.getOrDefault(false)
  }

  /** Android allows ratios between 1:2.39 and 2.39:1. */
  private fun ratio(width: Int, height: Int): Rational {
    if (width <= 0 || height <= 0) return Rational(9, 16)
    val value = width.toDouble() / height.toDouble()
    return when {
      value > 2.39 -> Rational(239, 100)
      value < 1 / 2.39 -> Rational(100, 239)
      else -> Rational(width, height)
    }
  }

  override fun definition() = ModuleDefinition {
    Name("FlockPip")
    Events("onPipChange")

    Function("isSupported") { supported() }

    Function("isInPip") {
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && appContext.currentActivity?.isInPictureInPictureMode == true
    }

    /** On during a video call: leaving the app floats the call. `width`/`height` give the window's shape. */
    Function("setAutoEnter") { enabled: Boolean, width: Int, height: Int ->
      autoEnter = enabled
      aspect = ratio(width, height)
      apply()
    }

    /** Floats the call right now (a button in the call). */
    Function("enter") {
      apply()
      enter()
    }

    // Android 8–11 have no auto-enter: float the call when the user leaves the app.
    OnUserLeavesActivity {
      if (autoEnter && Build.VERSION.SDK_INT < Build.VERSION_CODES.S) enter()
    }

    OnDestroy {
      listening?.removeOnPictureInPictureModeChangedListener(onModeChanged)
      listening = null
    }
  }
}
