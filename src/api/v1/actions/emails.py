"""
Copyright 2016 ElasticBox All rights reserved.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
"""

import cgi
import logging
from email.MIMEText import MIMEText
from smtplib import SMTP, SMTP_SSL

import concurrent.futures
from tornado.gen import Return, coroutine

from api.resources import INVITE_TEMPLATE, INVITE_SUBJECT

DEFAULT_THREADPOOL = concurrent.futures.ThreadPoolExecutor(max_workers=6)
INVITE_BODY_TYPE = 'html'


def start_connection(secure, server, port):
    connection = None
    if secure:
        try:
            connection = SMTP_SSL(server, port)
        except Exception:
            connection = None  # SSL/TLS is not available, fallback to starttls
            logging.info('Fall back to STARTTLS connection')

        if connection is None:
            connection = SMTP(server, port)
            connection.set_debuglevel(True)
            connection.starttls()

    else:
        connection = SMTP(server, port)

    return connection


def send(smtp_config, address, subject, body, body_type):
    server = smtp_config['server']
    port = int(smtp_config['port'])
    logging.debug('Sending mail "%s" from "%s" to server "%s"', subject, address, server)

    connection = start_connection(smtp_config.get('ssl', True), server, port)
    connection.set_debuglevel(False)

    authentication = smtp_config.get('authentication')
    if authentication is not None:
        connection.login(authentication['username'], authentication['password'])

    sender = smtp_config['no_reply_address']

    message = MIMEText(body, body_type)
    message['Subject'] = subject
    message['From'] = sender
    try:
        connection.sendmail(sender, address, message.as_string())
    finally:
        connection.close()

    logging.debug("Mail sent")


def generate_invite_template(origin_user, invite_address, message):
    message_escaped = cgi.escape(message)  # Message must be unicode and escaped
    name_escaped = cgi.escape(origin_user['name'])
    email_escaped = cgi.escape(origin_user['email'], quote=True)
    invite_address_escaped = cgi.escape(invite_address)

    return INVITE_TEMPLATE.format(invite_address=invite_address_escaped, custom_message=message_escaped,
                                  origin_name=name_escaped, origin_email=email_escaped)


def send_invites_sync(smtp_config, origin_user, info_invites, message):
    try:
        for invite in info_invites:
            template = generate_invite_template(origin_user, invite['confirm_url'], message)
            send(smtp_config, invite['email'], INVITE_SUBJECT, template, INVITE_BODY_TYPE)
    except Exception:
        logging.exception("Exception detected sending invites")
        raise


@coroutine
def send_invites(smtp_config, origin_user, info_invites, message, threadpool=None):
    if threadpool is None:
        threadpool = DEFAULT_THREADPOOL

    result = yield threadpool.submit(send_invites_sync, smtp_config, origin_user, info_invites, message)
    raise Return(result)
