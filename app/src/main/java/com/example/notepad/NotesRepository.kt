package com.example.notepad

import android.content.Context
import android.content.SharedPreferences
import java.util.UUID

/**
 * Persistence layer backed by SharedPreferences.
 *
 * Every write uses apply(), which is asynchronous but guaranteed to complete
 * before the process is killed by the OS. That gives us the "save on every
 * keystroke, survive the app being closed" behavior without doing synchronous
 * disk I/O on every character typed.
 */
class NotesRepository(context: Context) {

    private val prefs: SharedPreferences =
        context.applicationContext.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)

    // ---- Sheet list ------------------------------------------------------

    fun getSheetIds(): List<String> {
        val raw = prefs.getString(KEY_SHEET_IDS, "") ?: ""
        return if (raw.isEmpty()) emptyList() else raw.split(SEPARATOR)
    }

    private fun saveSheetIds(ids: List<String>) {
        prefs.edit().putString(KEY_SHEET_IDS, ids.joinToString(SEPARATOR)).apply()
    }

    fun createNewSheet(): String {
        val id = UUID.randomUUID().toString()
        val current = getSheetIds().toMutableList()
        current.add(id)
        saveSheetIds(current)
        return id
    }

    fun deleteSheet(id: String) {
        val current = getSheetIds().toMutableList()
        current.remove(id)
        saveSheetIds(current)
        prefs.edit().remove(PREFIX_SHEET_CONTENT + id).apply()
    }

    // ---- Sheet content ---------------------------------------------------

    fun getContent(id: String): String =
        prefs.getString(PREFIX_SHEET_CONTENT + id, "") ?: ""

    fun saveContent(id: String, content: String) {
        prefs.edit().putString(PREFIX_SHEET_CONTENT + id, content).apply()
    }

    // ---- Global preferences ---------------------------------------------

    fun getFontSize(): Float = prefs.getFloat(KEY_FONT_SIZE, DEFAULT_FONT_SIZE)

    fun setFontSize(size: Float) {
        prefs.edit().putFloat(KEY_FONT_SIZE, size).apply()
    }

    fun getColorMode(): Int = prefs.getInt(KEY_COLOR_MODE, 0)

    fun setColorMode(mode: Int) {
        prefs.edit().putInt(KEY_COLOR_MODE, mode).apply()
    }

    companion object {
        private const val PREF_NAME = "notepad_prefs"
        private const val KEY_SHEET_IDS = "sheet_ids"
        private const val KEY_FONT_SIZE = "font_size"
        private const val KEY_COLOR_MODE = "color_mode"
        private const val PREFIX_SHEET_CONTENT = "sheet_content_"
        private const val SEPARATOR = ","

        const val DEFAULT_FONT_SIZE = 18f

        const val COLOR_WHITE = 0
        const val COLOR_BLACK = 1
        const val COLOR_LIME  = 2
    }
}
