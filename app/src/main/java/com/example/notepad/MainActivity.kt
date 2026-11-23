package com.example.notepad

import android.os.Bundle
import android.view.Menu
import android.view.MenuItem
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import com.example.notepad.databinding.ActivityMainBinding
import com.google.android.material.tabs.TabLayoutMediator

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var adapter: NotesPagerAdapter
    private lateinit var repo: NotesRepository
    private var tabMediator: TabLayoutMediator? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        setSupportActionBar(binding.toolbar)

        repo = NotesRepository(this)

        // First launch: make sure there's always at least one sheet to write on.
        if (repo.getSheetIds().isEmpty()) {
            repo.createNewSheet()
        }

        adapter = NotesPagerAdapter(this, repo)
        binding.viewPager.adapter = adapter
        binding.viewPager.offscreenPageLimit = 1

        attachTabs()

        binding.btnAddTab.setOnClickListener {
            repo.createNewSheet()
            adapter.reload()
            binding.viewPager.setCurrentItem(adapter.itemCount - 1, true)
        }
    }

    private fun attachTabs() {
        tabMediator?.detach()
        tabMediator = TabLayoutMediator(binding.tabLayout, binding.viewPager) { tab, position ->
            tab.text = "Sheet ${position + 1}"
        }.also { it.attach() }
    }

    override fun onCreateOptionsMenu(menu: Menu?): Boolean {
        menuInflater.inflate(R.menu.menu_main, menu)
        return true
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean = when (item.itemId) {
        R.id.action_font_size    -> { showFontSizeDialog(); true }
        R.id.action_delete_sheet -> { confirmDeleteCurrentSheet(); true }
        R.id.action_change_color -> { showColorDialog(); true }
        else                     -> super.onOptionsItemSelected(item)
    }

    // ---- Dialogs ---------------------------------------------------------

    private fun showFontSizeDialog() {
        val labels = arrayOf("Small", "Medium", "Large", "Extra large")
        val values = floatArrayOf(14f, 18f, 22f, 28f)
        val current = repo.getFontSize()
        val checked = values.indexOfFirst { it == current }.let { if (it == -1) 1 else it }

        AlertDialog.Builder(this)
            .setTitle("Font size")
            .setSingleChoiceItems(labels, checked) { dialog, which ->
                repo.setFontSize(values[which])
                refreshAllVisibleFragments()
                dialog.dismiss()
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun showColorDialog() {
        val labels = arrayOf(
            "White (default)",
            "Black",
            "Lime pastel green"
        )
        val checked = repo.getColorMode()

        AlertDialog.Builder(this)
            .setTitle("Sheet color")
            .setSingleChoiceItems(labels, checked) { dialog, which ->
                repo.setColorMode(which)
                refreshAllVisibleFragments()
                dialog.dismiss()
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun confirmDeleteCurrentSheet() {
        val currentIndex = binding.viewPager.currentItem
        val ids = repo.getSheetIds()
        if (currentIndex < 0 || currentIndex >= ids.size) return

        AlertDialog.Builder(this)
            .setTitle("Delete sheet")
            .setMessage("Delete Sheet ${currentIndex + 1}? This cannot be undone.")
            .setPositiveButton("Delete") { _, _ ->
                repo.deleteSheet(ids[currentIndex])
                // Never leave the user with zero sheets — recreate one if needed.
                if (repo.getSheetIds().isEmpty()) repo.createNewSheet()
                adapter.reload()
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    /**
     * ViewPager2 keeps a few pages hydrated at once, so we walk them all rather
     * than only refresh the visible one.
     */
    private fun refreshAllVisibleFragments() {
        val count = adapter.itemCount
        for (i in 0 until count) {
            adapter.refreshAppearance(this, i)
        }
    }
}
