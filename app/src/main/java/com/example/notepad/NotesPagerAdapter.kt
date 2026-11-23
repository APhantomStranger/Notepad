package com.example.notepad

import androidx.fragment.app.Fragment
import androidx.fragment.app.FragmentActivity
import androidx.viewpager2.adapter.FragmentStateAdapter

class NotesPagerAdapter(
    private val activity: FragmentActivity,
    private val repo: NotesRepository
) : FragmentStateAdapter(activity) {

    // Snapshot of sheet IDs; the adapter re-reads this whenever data changes.
    private var sheetIds: List<String> = repo.getSheetIds()

    override fun getItemCount(): Int = sheetIds.size

    override fun createFragment(position: Int): Fragment =
        NoteFragment.newInstance(sheetIds[position])

    override fun getItemId(position: Int): Long =
        sheetIds[position].hashCode().toLong()

    override fun containsItem(itemId: Long): Boolean =
        sheetIds.any { it.hashCode().toLong() == itemId }

    /** Re-reads the sheet list from the repository. Call after add/delete. */
    fun reload() {
        sheetIds = repo.getSheetIds()
        notifyDataSetChanged()
    }

    /** Ask the currently visible fragment to re-apply its font/color. */
    fun refreshAppearance(activity: FragmentActivity, position: Int) {
        if (position < 0 || position >= sheetIds.size) return
        val tag = "f" + getItemId(position)
        val fragment = activity.supportFragmentManager.findFragmentByTag(tag) as? NoteFragment
        fragment?.applyAppearance()
    }
}
