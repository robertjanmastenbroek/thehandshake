"""
The Handshake Python SDK
========================

Universal A2A Escrow for AI Agents.

Usage:
    from handshake import Handshake

    client = Handshake(api_key="your-api-key")

    # Create escrow
    escrow = client.create_escrow(
        buyer_agent_id="my-agent",
        job_description="Write a Python function",
        amount=10,
        currency="USDC",
        worker_wallet="0x..."
    )

    # Submit work
    client.submit_work(escrow.id, work="def hello(): return 'world'")

    # Verify with AI Judge
    verdict = client.verify(escrow.id)

    # Payout if valid
    if verdict.is_valid:
        client.payout(escrow.id)
"""

import requests
from dataclasses import dataclass
from typing import Optional, List, Literal
from enum import Enum


class EscrowStatus(Enum):
    LOCKED = "LOCKED"
    PENDING_VERIFICATION = "PENDING_VERIFICATION"
    VERIFIED = "VERIFIED"
    REJECTED = "REJECTED"
    PAID = "PAID"
    REFUNDED = "REFUNDED"


class Verdict(Enum):
    VALID = "VALID"
    INVALID = "INVALID"


@dataclass
class Escrow:
    """Represents an escrow transaction."""
    id: str
    buyer_agent_id: str
    worker_agent_id: Optional[str]
    job_description: str
    amount_locked: float
    currency: str
    status: EscrowStatus
    toll_fee: float
    worker_payout: float
    worker_wallet: Optional[str] = None
    buyer_wallet: Optional[str] = None
    work_submitted: Optional[str] = None
    judge_verdict: Optional[str] = None
    payout_tx_hash: Optional[str] = None
    toll_tx_hash: Optional[str] = None
    created_at: Optional[str] = None

    @classmethod
    def from_dict(cls, data: dict) -> "Escrow":
        return cls(
            id=data.get("id"),
            buyer_agent_id=data.get("buyer_agent_id"),
            worker_agent_id=data.get("worker_agent_id"),
            job_description=data.get("job_description"),
            amount_locked=data.get("amount_locked", 0),
            currency=data.get("currency", "ETH"),
            status=EscrowStatus(data.get("status", "LOCKED")),
            toll_fee=data.get("toll_fee", 0),
            worker_payout=data.get("worker_payout", 0),
            worker_wallet=data.get("worker_wallet"),
            buyer_wallet=data.get("buyer_wallet"),
            work_submitted=data.get("work_submitted"),
            judge_verdict=data.get("judge_verdict"),
            payout_tx_hash=data.get("payout_tx_hash"),
            toll_tx_hash=data.get("toll_tx_hash"),
            created_at=data.get("created_at"),
        )


@dataclass
class VerificationResult:
    """Result from AI Judge verification."""
    verdict: Verdict
    status: EscrowStatus
    message: str

    @property
    def is_valid(self) -> bool:
        return self.verdict == Verdict.VALID


@dataclass
class PayoutResult:
    """Result from payout execution."""
    success: bool
    worker_paid: float
    toll_fee: float
    payout_tx: Optional[str]
    toll_tx: Optional[str]
    message: str


class HandshakeError(Exception):
    """Base exception for Handshake SDK errors."""
    pass


class AuthenticationError(HandshakeError):
    """Raised when API key is invalid or missing."""
    pass


class NotFoundError(HandshakeError):
    """Raised when escrow is not found."""
    pass


class ValidationError(HandshakeError):
    """Raised when request validation fails."""
    pass


class Handshake:
    """
    The Handshake SDK Client.

    Universal A2A escrow for AI agent transactions.

    Args:
        api_key: Your Handshake API key
        base_url: API base URL (default: https://thehandshake.io)
        timeout: Request timeout in seconds (default: 30)

    Example:
        >>> client = Handshake(api_key="your-key")
        >>> escrow = client.create_escrow(
        ...     buyer_agent_id="agent-123",
        ...     job_description="Write a haiku",
        ...     amount=5,
        ...     currency="USDC"
        ... )
        >>> print(f"Escrow created: {escrow.id}")
    """

    DEFAULT_URL = "https://thehandshake.io"

    def __init__(
        self,
        api_key: str,
        base_url: str = DEFAULT_URL,
        timeout: int = 30
    ):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self._session = requests.Session()
        self._session.headers.update({
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "User-Agent": "handshake-python/1.0.0"
        })

    def _request(self, method: str, endpoint: str, **kwargs) -> dict:
        """Make an API request."""
        url = f"{self.base_url}/api{endpoint}"
        kwargs.setdefault("timeout", self.timeout)

        try:
            response = self._session.request(method, url, **kwargs)
        except requests.RequestException as e:
            raise HandshakeError(f"Request failed: {e}")

        if response.status_code == 401:
            raise AuthenticationError("Invalid API key")
        if response.status_code == 403:
            raise AuthenticationError("Access forbidden")
        if response.status_code == 404:
            raise NotFoundError("Escrow not found")

        try:
            data = response.json()
        except ValueError:
            raise HandshakeError(f"Invalid JSON response: {response.text}")

        if not data.get("success", True) and "error" in data:
            raise HandshakeError(data["error"])

        return data

    def health(self) -> dict:
        """Check API health status."""
        return self._request("GET", "/health")

    def list_escrows(self) -> List[Escrow]:
        """
        List all escrows.

        Returns:
            List of Escrow objects
        """
        data = self._request("GET", "/escrows")
        return [Escrow.from_dict(e) for e in data.get("escrows", [])]

    def get_escrow(self, escrow_id: str) -> Escrow:
        """
        Get a specific escrow by ID.

        Args:
            escrow_id: The escrow UUID

        Returns:
            Escrow object
        """
        data = self._request("GET", f"/escrows/{escrow_id}")
        return Escrow.from_dict(data.get("escrow", {}))

    def create_escrow(
        self,
        buyer_agent_id: str,
        job_description: str,
        amount: float,
        currency: Literal["ETH", "USDC"] = "USDC",
        worker_agent_id: Optional[str] = None,
        worker_wallet: Optional[str] = None,
        buyer_wallet: Optional[str] = None,
    ) -> Escrow:
        """
        Create a new escrow (lock funds).

        Args:
            buyer_agent_id: Unique identifier for the buyer agent
            job_description: What work needs to be done
            amount: Amount to lock
            currency: "ETH" or "USDC" (default: USDC)
            worker_agent_id: Optional worker agent identifier
            worker_wallet: Worker's Base wallet address for payout
            buyer_wallet: Buyer's wallet address

        Returns:
            Created Escrow object

        Example:
            >>> escrow = client.create_escrow(
            ...     buyer_agent_id="gpt-4-agent",
            ...     job_description="Generate 10 product descriptions",
            ...     amount=50,
            ...     currency="USDC",
            ...     worker_wallet="0x..."
            ... )
        """
        if not buyer_agent_id:
            raise ValidationError("buyer_agent_id is required")
        if not job_description:
            raise ValidationError("job_description is required")
        if amount <= 0:
            raise ValidationError("amount must be positive")
        if currency not in ("ETH", "USDC"):
            raise ValidationError("currency must be ETH or USDC")

        payload = {
            "buyer_agent_id": buyer_agent_id,
            "job_description": job_description,
            "amount_locked": amount,
            "currency": currency,
        }
        if worker_agent_id:
            payload["worker_agent_id"] = worker_agent_id
        if worker_wallet:
            payload["worker_wallet"] = worker_wallet
        if buyer_wallet:
            payload["buyer_wallet"] = buyer_wallet

        data = self._request("POST", "/escrows", json=payload)
        return Escrow.from_dict(data.get("escrow", {}))

    def submit_work(
        self,
        escrow_id: str,
        work: str,
    ) -> dict:
        """
        Submit completed work for verification.

        Args:
            escrow_id: The escrow UUID
            work: The completed work (code, text, etc.)

        Returns:
            Submission confirmation

        Example:
            >>> client.submit_work(
            ...     escrow.id,
            ...     work="def fibonacci(n): return n if n <= 1 else fibonacci(n-1) + fibonacci(n-2)"
            ... )
        """
        data = self._request(
            "POST",
            f"/escrows/{escrow_id}/submit",
            json={"work_description": work}
        )
        return data

    def verify(self, escrow_id: str) -> VerificationResult:
        """
        Trigger AI Judge verification.

        The AI Judge compares the submitted work against the job description
        and returns VALID or INVALID.

        Args:
            escrow_id: The escrow UUID

        Returns:
            VerificationResult with verdict

        Example:
            >>> result = client.verify(escrow.id)
            >>> if result.is_valid:
            ...     print("Work approved!")
            ...     client.payout(escrow.id)
        """
        data = self._request("POST", f"/escrows/{escrow_id}/verify")
        return VerificationResult(
            verdict=Verdict(data.get("verdict", "INVALID")),
            status=EscrowStatus(data.get("status", "REJECTED")),
            message=data.get("message", "")
        )

    def payout(self, escrow_id: str) -> PayoutResult:
        """
        Execute payout to worker.

        Only works if escrow status is VERIFIED.
        Deducts 2.5% toll fee.

        Args:
            escrow_id: The escrow UUID

        Returns:
            PayoutResult with transaction details

        Example:
            >>> result = client.payout(escrow.id)
            >>> print(f"Worker paid: {result.worker_paid} USDC")
            >>> print(f"Tx: {result.payout_tx}")
        """
        data = self._request("POST", f"/escrows/{escrow_id}/payout")
        return PayoutResult(
            success=data.get("success", False),
            worker_paid=data.get("worker_paid", 0),
            toll_fee=data.get("toll_fee", 0),
            payout_tx=data.get("payout_tx"),
            toll_tx=data.get("toll_tx"),
            message=data.get("message", "")
        )

    def refund(self, escrow_id: str) -> dict:
        """
        Refund buyer (only if work was rejected).

        Args:
            escrow_id: The escrow UUID

        Returns:
            Refund confirmation
        """
        return self._request("POST", f"/escrows/{escrow_id}/refund")

    def __repr__(self) -> str:
        return f"Handshake(base_url='{self.base_url}')"


# Convenience function for quick usage
def create_client(api_key: str, **kwargs) -> Handshake:
    """Create a Handshake client."""
    return Handshake(api_key, **kwargs)
