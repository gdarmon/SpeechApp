package com.fala.app.data

import android.app.Activity
import android.content.MutableContextWrapper
import androidx.credentials.ClearCredentialStateRequest
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential

class SignInCancelled : Exception()

class GoogleSignIn(private val activity: Activity) {
    private val manager = CredentialManager.create(activity.applicationContext)
    suspend fun credential(clientId: String, nonce: String): String {
        try {
            val option = GetSignInWithGoogleOption.Builder(clientId).setNonce(nonce).build()
            val result = manager.getCredential(MutableContextWrapper(activity), GetCredentialRequest.Builder().addCredentialOption(option).build())
            val credential = result.credential
            if (credential is CustomCredential && credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
                return GoogleIdTokenCredential.createFrom(credential.data).idToken
            }
            throw IllegalStateException("Google sign-in did not finish. Please try again.")
        } catch (_: GetCredentialCancellationException) {
            throw SignInCancelled()
        } catch (_: NoCredentialException) {
            throw IllegalStateException("Add or sign in to a Google account on this phone, then try again.")
        } catch (_: GetCredentialException) {
            throw IllegalStateException("Google sign-in is unavailable right now. Please try again shortly.")
        }
    }
    suspend fun clear() {
        try { manager.clearCredentialState(ClearCredentialStateRequest()) }
        catch (_: androidx.credentials.exceptions.ClearCredentialException) { /* Fala's own session has already been cleared. */ }
    }
}
