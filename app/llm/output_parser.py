from app.llm.output_schema import SettlementModelOutput


def parse_settlement_output(raw_output: str) -> SettlementModelOutput:
    return SettlementModelOutput.model_validate_json(raw_output)

