#ifndef KATAGO_MOBILE_H_
#define KATAGO_MOBILE_H_

#include <stddef.h>
#include <stdint.h>

#if defined(_WIN32) && defined(KATAGO_MOBILE_BUILDING_DLL)
#define KATAGO_MOBILE_API __declspec(dllexport)
#elif defined(__GNUC__) || defined(__clang__)
#define KATAGO_MOBILE_API __attribute__((visibility("default")))
#else
#define KATAGO_MOBILE_API
#endif

#ifdef __cplusplus
extern "C" {
#endif

typedef struct KGEngine KGEngine;

enum {
  KG_OK = 0,
  KG_ERROR = 1
};

enum {
  KG_COLOR_EMPTY = 0,
  KG_COLOR_BLACK = 1,
  KG_COLOR_WHITE = 2
};

enum {
  KG_COORD_PASS = -1
};

typedef struct KGEngineOptions {
  const char* model_path;
  const char* coreml_model_path;
  const char* config_path;
  const char* log_path;
  const char* rules;

  int board_x_size;
  int board_y_size;
  float komi;

  int64_t max_visits;
  int64_t max_playouts;
  double max_time;
  int num_search_threads;

  int nn_max_batch_size;
  int nn_cache_size_power_of_two;
  int disable_fp16;
  int use_coreml;

  uint64_t random_seed;
} KGEngineOptions;

typedef struct KGMoveResult {
  int x;
  int y;
  int is_pass;
  char gtp[16];
  char pv[512];
  int pv_len;

  int64_t visits;
  double winrate;
  double score_lead;
  double score_mean;
  double utility;
  double policy_prior;
} KGMoveResult;

typedef void (*KGAnalysisCallback)(
  const KGMoveResult* results,
  int results_written,
  void* user_data
);

KATAGO_MOBILE_API const char* kg_mobile_version(void);

KATAGO_MOBILE_API const char* kg_mobile_move_result_pv(const KGMoveResult* result);

KATAGO_MOBILE_API void kg_mobile_default_options(KGEngineOptions* options);

KATAGO_MOBILE_API KGEngine* kg_mobile_engine_create(
  const KGEngineOptions* options,
  char* error,
  size_t error_len
);

KATAGO_MOBILE_API void kg_mobile_engine_destroy(KGEngine* engine);

KATAGO_MOBILE_API int kg_mobile_clear_board(
  KGEngine* engine,
  int board_x_size,
  int board_y_size,
  char* error,
  size_t error_len
);

KATAGO_MOBILE_API int kg_mobile_play(
  KGEngine* engine,
  int color,
  int x,
  int y,
  char* error,
  size_t error_len
);

KATAGO_MOBILE_API int kg_mobile_set_search_limits(
  KGEngine* engine,
  int64_t max_visits,
  int64_t max_playouts,
  double max_time,
  int num_search_threads,
  char* error,
  size_t error_len
);

KATAGO_MOBILE_API int kg_mobile_genmove(
  KGEngine* engine,
  int color,
  int play_move,
  KGMoveResult* result,
  char* error,
  size_t error_len
);

KATAGO_MOBILE_API int kg_mobile_analyze(
  KGEngine* engine,
  int color,
  KGMoveResult* results,
  int results_capacity,
  int* results_written,
  char* error,
  size_t error_len
);

KATAGO_MOBILE_API int kg_mobile_analyze_start(
  KGEngine* engine,
  int color,
  int results_capacity,
  double callback_period,
  double first_callback_after,
  KGAnalysisCallback callback,
  void* user_data,
  char* error,
  size_t error_len
);

KATAGO_MOBILE_API void kg_mobile_stop(KGEngine* engine);

#ifdef __cplusplus
}
#endif

#endif
