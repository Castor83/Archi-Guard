"""Fallback only: prevent another model run if compaction nevertheless happened."""
import json
import sys


def main():
    try:
        event = json.loads(sys.stdin.read(65537))
        if (event.get('hook_event_name') != 'SessionStart' or event.get('source') != 'compact'
                or event.get('subagent_id')):
            print('{}')
            return
        reason = ('Unerwartete Komprimierung: keine weitere Modellarbeit im alten Durchlauf. '
                  'Vorhandenen PreCompact-Checkpoint und Nachfolgestatus lokal pruefen. '
                  'Keinen Bericht durch einen neuen Modelllauf erzeugen; Nachfolger wiederverwenden. '
                  'Alten Chat erst nach erfolgreicher Uebernahme archivieren.')
        print(json.dumps({'continue': False, 'stopReason': reason, 'systemMessage': reason}))
    except (ValueError, TypeError, AttributeError):
        print(json.dumps({'continue': False, 'stopReason': 'Fallback-Ereignis ungueltig; vorsorglich gestoppt.'}))


if __name__ == '__main__':
    main()
