"""
Server-Side Recording Service
Manages the call recording lifecycle with PCI-compliant gaps.

Design (from §10 of the product doc):
  "A server-side recorder subscribes to both audio tracks and writes
   them into one continuous recording per call. When Safe Mode starts,
   the recorder stops writing the live audio and writes a short
   system-made notice, such as 'Payment details withheld', followed
   by silence, so the timing stays aligned. The card audio is never
   saved and then deleted; it is simply never written. When payment
   ends, the recorder returns to the live audio."

The recorder is a server component: nothing in the agent's browser
can change it, and the AI's own audio is never recorded.
"""
import time
import uuid
from enum import Enum
from typing import Dict, List, Any, Optional


class RecordingState(str, Enum):
    ACTIVE = "ACTIVE"
    PAUSED_PCI = "PAUSED_PCI"
    RESUMED = "RESUMED"
    STOPPED = "STOPPED"


class TimelineSegment:
    """A single segment on the recording timeline."""

    def __init__(
        self,
        segment_type: str,
        start_time: float,
        end_time: Optional[float] = None,
        notice: Optional[str] = None,
        token_ref: Optional[str] = None,
    ):
        self.segment_id = f"seg_{uuid.uuid4().hex[:8]}"
        self.segment_type = segment_type  # "AUDIO", "PCI_WITHHELD", "NOTICE"
        self.start_time = start_time
        self.end_time = end_time
        self.notice = notice
        self.token_ref = token_ref

    def to_dict(self) -> Dict[str, Any]:
        return {
            "segment_id": self.segment_id,
            "type": self.segment_type,
            "start_time": self.start_time,
            "end_time": self.end_time,
            "duration_s": round(self.end_time - self.start_time, 2) if self.end_time else None,
            "notice": self.notice,
            "token_ref": self.token_ref,
        }


class CallRecording:
    """Manages the recording state and timeline for a single call."""

    def __init__(self, call_id: str):
        self.call_id = call_id
        self.recording_id = f"rec_{uuid.uuid4().hex[:12]}"
        self.state: RecordingState = RecordingState.ACTIVE
        self.segments: List[TimelineSegment] = []
        self.pci_gap_count: int = 0
        self.created_at: float = time.time()

        # Start the first audio segment
        self._current_segment = TimelineSegment(
            segment_type="AUDIO",
            start_time=self.created_at,
        )

    def pause_for_pci(self, session_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Pauses the recording for a PCI Safe Mode payment segment.
        Closes the current audio segment and opens a PCI_WITHHELD gap.
        The card audio is simply NEVER WRITTEN — not saved then deleted.
        """
        if self.state == RecordingState.PAUSED_PCI:
            return {"error": "Recording already paused for PCI"}

        now = time.time()

        # Close the current audio segment
        if self._current_segment:
            self._current_segment.end_time = now
            self.segments.append(self._current_segment)

        # Insert a system notice segment (the "Payment details withheld" marker)
        notice_segment = TimelineSegment(
            segment_type="NOTICE",
            start_time=now,
            end_time=now + 0.5,  # Brief 0.5s system notice
            notice="Payment details withheld — PCI Safe Mode active",
        )
        self.segments.append(notice_segment)

        # Open the PCI withheld gap (silence — no audio written)
        self._current_segment = TimelineSegment(
            segment_type="PCI_WITHHELD",
            start_time=now + 0.5,
            notice=f"PCI audio withheld, session {session_id or 'unknown'}",
        )

        self.state = RecordingState.PAUSED_PCI
        self.pci_gap_count += 1

        return {
            "recording_id": self.recording_id,
            "state": self.state.value,
            "action": "PAUSED_FOR_PCI",
            "pci_gap_number": self.pci_gap_count,
            "notice": notice_segment.notice,
        }

    def resume_after_pci(self, token_ref: str, last4: str = "", brand: str = "") -> Dict[str, Any]:
        """
        Resumes the recording after PCI Safe Mode completes.
        Closes the PCI gap, stamps it with the token reference,
        and opens a new audio segment.
        """
        if self.state != RecordingState.PAUSED_PCI:
            return {"error": "Recording is not paused for PCI"}

        now = time.time()

        # Close the PCI withheld gap
        if self._current_segment:
            self._current_segment.end_time = now
            self._current_segment.token_ref = token_ref
            self._current_segment.notice = (
                f"PCI segment withheld, token ref {token_ref}"
            )
            self.segments.append(self._current_segment)

        # Open a new audio segment
        self._current_segment = TimelineSegment(
            segment_type="AUDIO",
            start_time=now,
        )

        self.state = RecordingState.RESUMED

        return {
            "recording_id": self.recording_id,
            "state": self.state.value,
            "action": "RESUMED_AFTER_PCI",
            "token_ref": token_ref,
            "pci_marker": f"PCI segment withheld, token ref {token_ref}",
        }

    def stop(self) -> Dict[str, Any]:
        """Stops recording at end of call."""
        now = time.time()
        if self._current_segment:
            self._current_segment.end_time = now
            self.segments.append(self._current_segment)
            self._current_segment = None
        self.state = RecordingState.STOPPED

        return {
            "recording_id": self.recording_id,
            "state": self.state.value,
            "total_segments": len(self.segments),
            "pci_gaps": self.pci_gap_count,
        }

    def get_timeline(self) -> Dict[str, Any]:
        """
        Returns the full recording timeline.
        The timeline shows exactly where audio exists, where it was
        withheld, and the PCI markers — but never any card data.
        """
        segments = [s.to_dict() for s in self.segments]

        # Include the current segment if still open
        if self._current_segment:
            current = self._current_segment.to_dict()
            current["end_time"] = None  # Still recording
            current["duration_s"] = round(time.time() - self._current_segment.start_time, 2)
            segments.append(current)

        return {
            "recording_id": self.recording_id,
            "call_id": self.call_id,
            "state": self.state.value,
            "total_segments": len(segments),
            "pci_gaps": self.pci_gap_count,
            "segments": segments,
        }

    def has_pci_gap(self) -> bool:
        """Returns True if this recording contains at least one PCI withheld gap."""
        return self.pci_gap_count > 0


class RecordingService:
    """Manages recordings for all active calls."""

    def __init__(self):
        self._recordings: Dict[str, CallRecording] = {}

    def start_recording(self, call_id: str) -> CallRecording:
        """Creates and starts a new recording for the given call."""
        recording = CallRecording(call_id=call_id)
        self._recordings[call_id] = recording
        return recording

    def get_recording(self, call_id: str) -> Optional[CallRecording]:
        """Returns the recording for a call, or None."""
        return self._recordings.get(call_id)

    def get_or_create(self, call_id: str) -> CallRecording:
        """Returns existing recording or creates a new one."""
        if call_id not in self._recordings:
            return self.start_recording(call_id)
        return self._recordings[call_id]

    def pause_for_pci(self, call_id: str, session_id: Optional[str] = None) -> Dict[str, Any]:
        """Pauses recording for PCI Safe Mode."""
        rec = self.get_or_create(call_id)
        return rec.pause_for_pci(session_id=session_id)

    def resume_after_pci(
        self, call_id: str, token_ref: str, last4: str = "", brand: str = ""
    ) -> Dict[str, Any]:
        """Resumes recording after PCI Safe Mode."""
        rec = self.get_recording(call_id)
        if not rec:
            return {"error": f"No recording found for call {call_id}"}
        return rec.resume_after_pci(token_ref=token_ref, last4=last4, brand=brand)

    def stop_recording(self, call_id: str) -> Dict[str, Any]:
        """Stops the recording for the given call."""
        rec = self.get_recording(call_id)
        if not rec:
            return {"error": f"No recording found for call {call_id}"}
        return rec.stop()

    def get_timeline(self, call_id: str) -> Dict[str, Any]:
        """Returns the timeline for the given call."""
        rec = self.get_recording(call_id)
        if not rec:
            return {"error": f"No recording found for call {call_id}"}
        return rec.get_timeline()


# Singleton
recording_service = RecordingService()

