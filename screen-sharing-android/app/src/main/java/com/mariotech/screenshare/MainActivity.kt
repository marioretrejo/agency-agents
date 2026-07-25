package com.mariotech.screenshare

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import com.mariotech.screenshare.databinding.ActivityMainBinding

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding

    private val notificationPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { /* best effort */ }

    private val projectionLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            if (result.resultCode == Activity.RESULT_OK && result.data != null) {
                startSharing(result.resultCode, result.data!!)
            } else {
                toast("Screen capture was cancelled")
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        prefillCodeFromDeepLink(intent)

        binding.shareButton.setOnClickListener { requestCaptureThenShare() }
        binding.controlButton.setOnClickListener {
            startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
            toast("Enable \"Screen Sharing Control\" to allow remote control")
        }
        binding.stopButton.setOnClickListener {
            startService(Intent(this, ScreenShareService::class.java).apply {
                action = ScreenShareService.ACTION_STOP
            })
            binding.status.text = getString(R.string.status_stopped)
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        prefillCodeFromDeepLink(intent)
    }

    private fun prefillCodeFromDeepLink(intent: Intent?) {
        val room = intent?.data?.getQueryParameter("room")
        if (!room.isNullOrBlank()) binding.codeInput.setText(room.uppercase())
    }

    private fun requestCaptureThenShare() {
        val code = binding.codeInput.text.toString().trim().uppercase()
        if (code.length != 6) {
            toast("Enter the 6-character code")
            return
        }
        val mpm = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        projectionLauncher.launch(mpm.createScreenCaptureIntent())
    }

    private fun startSharing(resultCode: Int, data: Intent) {
        val code = binding.codeInput.text.toString().trim().uppercase()
        val service = Intent(this, ScreenShareService::class.java).apply {
            putExtra(ScreenShareService.EXTRA_RESULT_CODE, resultCode)
            putExtra(ScreenShareService.EXTRA_RESULT_DATA, data)
            putExtra(ScreenShareService.EXTRA_CODE, code)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(service)
        } else {
            startService(service)
        }
        binding.status.text = getString(R.string.status_sharing, code)
    }

    private fun toast(msg: String) = Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()
}
