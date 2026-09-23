package com.audioplayer.bpm

import java.io.File
import java.io.FileInputStream
import java.security.MessageDigest

object FileHasher {

    private const val BUFFER_SIZE = 8192

    fun computeSha256(filePath: String): String {
        val file = File(filePath)
        if (!file.exists()) {
            throw IllegalArgumentException("File not found: $filePath")
        }
        if (file.length() == 0L) {
            throw IllegalArgumentException("File is empty: $filePath")
        }

        val digest = MessageDigest.getInstance("SHA-256")
        val buffer = ByteArray(BUFFER_SIZE)

        FileInputStream(file).use { stream ->
            var bytesRead = stream.read(buffer)
            while (bytesRead != -1) {
                digest.update(buffer, 0, bytesRead)
                bytesRead = stream.read(buffer)
            }
        }

        return digest.digest().joinToString("") { "%02x".format(it) }
    }
}
