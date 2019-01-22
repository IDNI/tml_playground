FROM alpine:edge

RUN apk add nodejs npm yarn

ENV TAU_COMMIT fd84638

RUN apk add --no-cache --virtual .build-deps g++ git \
    && git clone "https://github.com/idni/tau" /home/tau \
    && cd /home/tau \
    && git reset --hard $TAU_COMMIT \
    && g++ -std=c++1y tml.cpp -W -Wall -Wpedantic -otml -g \
    && apk del .build-deps \
    && yarn

CMD [ "node" ]
