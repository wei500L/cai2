class DiplomacyError(Exception):
    """Base error for the Diplomacy backend."""


class RoomNotFoundError(DiplomacyError):
    """Raised when a room cannot be found."""


class PlayerNotFoundError(DiplomacyError):
    """Raised when a player cannot be found."""


class InvalidPhaseError(DiplomacyError):
    """Raised when a phase transition is invalid."""


class InvalidActionError(DiplomacyError):
    """Raised when an action fails validation."""


class RoomFullError(DiplomacyError):
    """Raised when a room has reached its human player limit."""


class NotRoomHostError(DiplomacyError):
    """Raised when a non-host player attempts a host-only operation."""


class NotAllPlayersReadyError(DiplomacyError):
    """Raised when a game starts before every human player is ready."""


class RateLimitedError(DiplomacyError):
    """Raised when a caller is rate limited."""


class FactionAlreadyTakenError(DiplomacyError):
    """Raised when a faction has already been claimed."""


class MessageFormatError(DiplomacyError):
    """Raised when an incoming message cannot be parsed."""
