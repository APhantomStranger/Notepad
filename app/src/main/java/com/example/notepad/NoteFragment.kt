package com.example.notepad

import android.graphics.Color
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.util.TypedValue
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import com.example.notepad.databinding.FragmentNoteBinding

class NoteFragment : Fragment() {

    private var _binding: FragmentNoteBinding? = null
    private val binding get() = _binding!!

    private lateinit var sheetId: String
    private lateinit var repo: NotesRepository

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        sheetId = arguments?.getString(ARG_SHEET_ID).orEmpty()
        repo = NotesRepository(requireContext())
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentNoteBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        // Load whatever was previously saved for this sheet.
        binding.editText.setText(repo.getContent(sheetId))

        applyAppearance()

        // Save on every text change (better than "per word" — covers process-kill).
        binding.editText.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) = Unit
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) = Unit
            override fun afterTextChanged(s: Editable?) {
                repo.saveContent(sheetId, s?.toString().orEmpty())
            }
        })
    }

    /** Applies current font size + color scheme. Safe to call any time the view is live. */
    fun applyAppearance() {
        val b = _binding ?: return
        b.editText.setTextSize(TypedValue.COMPLEX_UNIT_SP, repo.getFontSize())

        val (bg, fg) = when (repo.getColorMode()) {
            NotesRepository.COLOR_BLACK -> Color.parseColor("#121212") to Color.parseColor("#FFFFFF")
            NotesRepository.COLOR_LIME  -> Color.parseColor("#DDF3B8") to Color.parseColor("#000000")
            else                         -> Color.parseColor("#FFFFFF") to Color.parseColor("#000000")
        }
        b.root.setBackgroundColor(bg)
        b.editText.setTextColor(fg)
        b.editText.setHintTextColor(Color.argb(120, Color.red(fg), Color.green(fg), Color.blue(fg)))
    }

    override fun onPause() {
        // Belt-and-braces: force a save when we lose focus, in case the OS is about
        // to kill us and an apply() write is still pending.
        _binding?.editText?.text?.toString()?.let { repo.saveContent(sheetId, it) }
        super.onPause()
    }

    override fun onDestroyView() {
        _binding?.editText?.text?.toString()?.let { repo.saveContent(sheetId, it) }
        super.onDestroyView()
        _binding = null
    }

    companion object {
        private const val ARG_SHEET_ID = "sheet_id"

        fun newInstance(sheetId: String): NoteFragment = NoteFragment().apply {
            arguments = Bundle().apply { putString(ARG_SHEET_ID, sheetId) }
        }
    }
}
