class ProtocolError(Exception):
    """Raised when a protocol message cannot be routed or decoded."""


class UnknownMessageTypeError(ProtocolError, KeyError):
    """Raised when an envelope type has no registered payload model."""
