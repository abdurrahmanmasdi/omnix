"""Patient facts in existing contract-v1 fields; no direct database writes."""
import json
from langchain_core.tools import tool
from langchain_core.runnables import RunnableConfig

FORMAT = 'omnix.patient-summary.v1'


def summary_data(previous):
    try:
        data = json.loads(previous or '')
        if (isinstance(data, dict) and data.get('format') == FORMAT and
                isinstance(data.get('facts'), dict) and isinstance(data.get('summary'), str)):
            return data
    except (ValueError, TypeError):
        pass
    return {'format': FORMAT, 'facts': {}, 'summary': previous or '', 'handoffSummary': None}


def summary_action(data):
    value = json.dumps(data, ensure_ascii=False)
    if len(value) > 5000:
        raise ValueError('Patient summary exceeds contract limit')
    return json.dumps({'action': 'UPDATE_SUMMARY', 'payload': {'summary': value}}, ensure_ascii=False)


@tool
async def save_patient_facts(
    config: RunnableConfig,
    summary: str,
    first_name: str | None = None,
    last_name: str | None = None,
    country: str | None = None,
    treatment_interest: str | None = None,
    travel_window: str | None = None,
    photo_sent: bool | None = None,
) -> str:
    """Save only facts explicitly supplied by this patient, silently after answering.
    Name and country use UPDATE_LEAD. Treatment interest, travel window, photo sent
    and text-derived mood go into UPDATE_SUMMARY, together with a cumulative concise
    summary preserving prior facts and open questions. Omit unknown fields; do not
    infer country/name or claim consent from a photo. No new contract fields.
    """
    context = config['configurable']
    if not context.get('lead_id'):
        return 'UNVERIFIED: No linked patient record.'
    data = summary_data(context.get('patient_summary'))
    data['summary'] = summary
    data['facts']['mood'] = context['patient_mood']
    for key, value in [('treatmentInterest', treatment_interest), ('travelWindow', travel_window), ('photoSent', photo_sent)]:
        if value is not None:
            data['facts'][key] = value
    updates = {k: v for k, v in [('firstName', first_name), ('lastName', last_name), ('country', country)] if v is not None}
    actions = ([{'action': 'UPDATE_LEAD', 'payload': updates}] if updates else [])
    actions.append(json.loads(summary_action(data)))
    return json.dumps(actions, ensure_ascii=False)
