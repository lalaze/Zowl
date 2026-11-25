import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:uuid/uuid.dart';

import '../../core/api.dart';
import '../../core/formatters.dart';
import '../../core/l10n.dart';
import '../../core/models.dart';
import '../../core/providers.dart';
import '../../core/theme.dart';
import '../common/owl_motion.dart';
import '../common/sky.dart';
import '../common/widgets.dart';

class ImportScreen extends ConsumerStatefulWidget {
  const ImportScreen({super.key, this.quick = false, this.sharedFiles});
  final bool quick;
  final List<XFile>? sharedFiles;
  @override
  ConsumerState<ImportScreen> createState() => _ImportScreenState();
}

class _ImportScreenState extends ConsumerState<ImportScreen> {
  late Future<List<RecognitionJob>> _jobs;
  bool _uploading = false;
  bool _selecting = false;
  List<XFile>? _retryFiles;
  String? _submissionId;
  double _progress = 0;

  @override
  void initState() {
    super.initState();
    _jobs = ref.read(repositoryProvider).recognitionJobs();
    if (widget.quick) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _pickAndUpload());
    }
  }

  void _refreshJobs() {
    setState(() {
      _jobs = ref.read(repositoryProvider).recognitionJobs();
    });
  }

  Future<void> _pickAndUpload({bool retry = false}) async {
    if (_uploading || _selecting) return;
    setState(() => _selecting = true);
    try {
      final providerRequest = ref.read(repositoryProvider).recognitionProvider()
        ..ignore();
      final files = retry
          ? _retryFiles ?? <XFile>[]
          : widget.sharedFiles ??
                await ref
                    .read(screenshotPickerProvider)
                    .pickScreenshots(limit: widget.quick ? 1 : 10);
      if (files.isEmpty || !mounted) return;
      final provider = await providerRequest;
      if (!mounted) return;
      if (files.any(
        (file) => !RegExp(
          r'\.(jpe?g|png|webp)$',
          caseSensitive: false,
        ).hasMatch(file.name),
      )) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              tr(
                'Only supports JPG, PNG or WebP screenshots',
                '仅支持 JPG、PNG 或 WebP 截图',
              ),
            ),
          ),
        );
        return;
      }
      var bytes = 0;
      for (final file in files) {
        bytes += await file.length();
      }
      if (bytes > 40 * 1024 * 1024) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                tr(
                  'Total screenshot size must not exceed 40 MiB',
                  '截图总大小不能超过 40 MiB',
                ),
              ),
            ),
          );
        }
        return;
      }
      for (final file in files) {
        if (await file.length() > 8 * 1024 * 1024) {
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(
                  tr(
                    'Each screenshot must be smaller than 8 MiB',
                    '每张截图须小于 8 MiB',
                  ),
                ),
              ),
            );
          }
          return;
        }
      }
      if (!mounted) return;
      var consent = !provider.sendsImagesToThirdParty;
      if (provider.sendsImagesToThirdParty) {
        consent =
            await showDialog<bool>(
              context: context,
              builder: (context) => AlertDialog(
                title: Text(provider.label),
                content: Text(
                  '${provider.disclosure}\n\n${provider.retentionPolicy}${widget.quick ? tr('\n\nReliable results will be posted automatically. Uncertain results need review.', '\n\n识别可靠的结果会自动入账，不确定的结果需要核对。') : ''}',
                ),
                actions: [
                  TextButton(
                    onPressed: () => Navigator.pop(context, false),
                    child: Text(tr('Cancel', '取消')),
                  ),
                  FilledButton(
                    onPressed: () => Navigator.pop(context, true),
                    child: Text(tr('Agree and upload', '同意并上传')),
                  ),
                ],
              ),
            ) ??
            false;
      } else if (widget.sharedFiles != null) {
        consent =
            await showDialog<bool>(
              context: context,
              builder: (context) => AlertDialog(
                title: Text(
                  tr('Record this shared screenshot?', '用这张分享的截图记账？'),
                ),
                content: Text(
                  tr(
                    'Reliable results will be posted automatically. Uncertain results need review.',
                    '识别可靠的结果会自动入账，不确定的结果需要核对。',
                  ),
                ),
                actions: [
                  TextButton(
                    onPressed: () => Navigator.pop(context, false),
                    child: Text(tr('Cancel', '取消')),
                  ),
                  FilledButton(
                    onPressed: () => Navigator.pop(context, true),
                    child: Text(tr('Recognize and post', '识别并入账')),
                  ),
                ],
              ),
            ) ??
            false;
      }
      if (!consent || !mounted) return;
      _retryFiles = files;
      if (!retry || _submissionId == null) _submissionId = const Uuid().v4();
      setState(() {
        _uploading = true;
        _progress = 0;
      });
      final jobId = await ref
          .read(repositoryProvider)
          .uploadScreenshots(
            files,
            consentToThirdParty: consent,
            autoConfirm: widget.quick && files.length == 1,
            submissionId: _submissionId,
            onProgress: (sent, total) {
              if (mounted && total > 0) {
                setState(() => _progress = sent / total);
              }
            },
          );
      _retryFiles = null;
      if (!mounted) return;
      refreshLedger(ref);
      await context.push('/imports/screenshots/$jobId');
    } on ApiException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              tr(
                '${error.message}. Result may be unknown; retry the same submission or check the task history first.',
                '${error.message}。上传结果可能未知，请重试本次提交，或先查看任务记录。',
              ),
            ),
          ),
        );
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              tr(
                'Could not read the screenshot. Check task history if an upload started, then try again.',
                '无法读取截图。如已开始上传，请先查看任务记录再重试。',
              ),
            ),
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _uploading = false;
          _selecting = false;
        });
        _refreshJobs();
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final provider = ref.watch(recognitionProviderInfoProvider);
    final notificationPage = ref.watch(notificationCapturePageProvider);
    final pendingNotifications = notificationPage.value?.pendingCount ?? 0;
    final t = context.ze;
    return Scaffold(
      body: RefreshIndicator(
        edgeOffset: skyBarExtent(context),
        onRefresh: () async {
          ref.invalidate(recognitionProviderInfoProvider);
          ref.invalidate(notificationCapturePageProvider);
          _refreshJobs();
          await Future.wait([
            _jobs,
            ref.read(notificationCapturePageProvider.future),
          ]);
        },
        child: SkyScrollScope(
          child: CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              ...skyStripSlivers(
                title: widget.quick
                    ? tr('Quick screenshot entry', '截图快速记账')
                    : tr('Recognize screenshots', '截图识别'),
              ),
              SliverPadding(
                padding: EdgeInsets.fromLTRB(
                  24,
                  8,
                  24,
                  MediaQuery.paddingOf(context).bottom + 28,
                ),
                sliver: SliverToBoxAdapter(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      ZeCard(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Row(
                              children: [
                                const ZeIconTile(
                                  icon: Icons.document_scanner_rounded,
                                  color: ZeHues.sky,
                                  size: 48,
                                ),
                                const SizedBox(width: 14),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        tr(
                                          'Record a payment screenshot',
                                          '从支付截图记账',
                                        ),
                                        style: Theme.of(
                                          context,
                                        ).textTheme.titleLarge,
                                      ),
                                      const SizedBox(height: 2),
                                      Text(
                                        tr(
                                          'Up to 10 images; posted only after confirmation',
                                          '最多 10 张，确认后才会入账',
                                        ),
                                        style: Theme.of(
                                          context,
                                        ).textTheme.bodySmall,
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 18),
                            Row(
                              children: [
                                Expanded(
                                  child: _ImportStep(
                                    number: 1,
                                    label: tr('Select', '选择'),
                                  ),
                                ),
                                Padding(
                                  padding: const EdgeInsets.only(bottom: 18),
                                  child: Icon(
                                    Icons.arrow_forward_rounded,
                                    size: 16,
                                    color: t.faint,
                                  ),
                                ),
                                Expanded(
                                  child: _ImportStep(
                                    number: 2,
                                    label: tr('Review', '核对'),
                                  ),
                                ),
                                Padding(
                                  padding: const EdgeInsets.only(bottom: 18),
                                  child: Icon(
                                    Icons.arrow_forward_rounded,
                                    size: 16,
                                    color: t.faint,
                                  ),
                                ),
                                Expanded(
                                  child: _ImportStep(
                                    number: 3,
                                    label: tr('Post', '入账'),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 18),
                            if (widget.quick) ...[
                              Text(
                                tr(
                                  'Choose one screenshot. Reliable results are posted automatically; uncertain results need review.',
                                  '选择一张截图。识别可靠的结果会自动入账，不确定的结果需要核对。',
                                ),
                                style: Theme.of(context).textTheme.bodySmall,
                              ),
                              const SizedBox(height: 10),
                            ],
                            FilledButton.icon(
                              onPressed: _uploading || _selecting
                                  ? null
                                  : _pickAndUpload,
                              icon: const Icon(Icons.photo_library_rounded),
                              label: Text(
                                _uploading
                                    ? tr(
                                        'Uploading ${(_progress * 100).round()}%',
                                        '正在上传 ${(_progress * 100).round()}%',
                                      )
                                    : tr(
                                        'Select screenshots to begin',
                                        '选择截图开始',
                                      ),
                              ),
                            ),
                            if (_retryFiles != null && !_uploading)
                              TextButton(
                                onPressed: () => _pickAndUpload(retry: true),
                                child: Text(
                                  tr('Retry same submission', '重试本次提交'),
                                ),
                              ),
                            if (_uploading)
                              Padding(
                                padding: const EdgeInsets.only(top: 10),
                                child: LinearProgressIndicator(
                                  value: _progress == 0 ? null : _progress,
                                ),
                              ),
                            const SizedBox(height: 14),
                            provider.when(
                              loading: () =>
                                  const LinearProgressIndicator(minHeight: 2),
                              error: (error, _) => Text(
                                error.toString(),
                                style: Theme.of(context).textTheme.bodySmall,
                              ),
                              data: (info) => Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Padding(
                                    padding: const EdgeInsets.only(top: 1),
                                    child: Icon(
                                      Icons.privacy_tip_rounded,
                                      size: 16,
                                      color: t.income,
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  Expanded(
                                    child: Text.rich(
                                      TextSpan(
                                        children: [
                                          TextSpan(
                                            text: '${info.label}  ',
                                            style: TextStyle(
                                              color: t.ink,
                                              fontWeight: FontWeight.w700,
                                            ),
                                          ),
                                          TextSpan(text: info.disclosure),
                                        ],
                                      ),
                                      style: Theme.of(
                                        context,
                                      ).textTheme.bodySmall,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 12),
                      ZeGroup(
                        children: [
                          ZeNavRow(
                            icon: Icons.bolt_rounded,
                            color: ZeHues.moss,
                            title: tr('Review inbox', '待核对'),
                            subtitle: pendingNotifications == 0
                                ? tr(
                                    'Payment pages and notifications awaiting review',
                                    '支付页与通知候选在这里核对',
                                  )
                                : tr(
                                    '$pendingNotifications awaiting confirmation',
                                    '$pendingNotifications 笔待确认',
                                  ),
                            badge: pendingNotifications > 0
                                ? ZeBadge(
                                    label: pendingNotifications > 99
                                        ? '99+'
                                        : '$pendingNotifications',
                                    tone: ZeTone.warn,
                                  )
                                : null,
                            onTap: () async {
                              await context.push('/imports/notifications');
                              ref.invalidate(notificationCapturePageProvider);
                            },
                          ),
                        ],
                      ),
                      const SizedBox(height: 22),
                      ZeSectionHeader(
                        title: tr('Recent recognition tasks', '最近识别任务'),
                        subtitle: tr(
                          'Continue reviewing unconfirmed screenshots',
                          '继续核对尚未确认的截图',
                        ),
                      ),
                      const SizedBox(height: 10),
                      FutureBuilder<List<RecognitionJob>>(
                        future: _jobs,
                        builder: (context, snapshot) {
                          if (snapshot.connectionState ==
                                  ConnectionState.waiting &&
                              !snapshot.hasData) {
                            return const Padding(
                              padding: EdgeInsets.all(24),
                              child: OwlLoading(size: 72),
                            );
                          }
                          if (snapshot.hasError) {
                            return ErrorView(
                              error: snapshot.error!,
                              onRetry: _refreshJobs,
                            );
                          }
                          final jobs = snapshot.data ?? const [];
                          if (jobs.isEmpty) {
                            return EmptyView(
                              message: tr('No recognition tasks yet', '还没有识别任务'),
                              subtitle: tr(
                                'Select your first screenshots to see progress here.',
                                '选择第一批截图后，进度会显示在这里。',
                              ),
                            );
                          }
                          return ZeGroup(
                            children: [
                              for (final job in jobs)
                                ZeNavRow(
                                  icon: switch (job.status) {
                                    'completed' => Icons.check_rounded,
                                    'failed' => Icons.error_outline_rounded,
                                    _ => Icons.collections_rounded,
                                  },
                                  tone: switch (job.status) {
                                    'completed' => ZeTone.income,
                                    'failed' => ZeTone.danger,
                                    'reviewing' => ZeTone.warn,
                                    _ => ZeTone.info,
                                  },
                                  title:
                                      '${tr(plural(job.totalCount, 'screenshot'), '${job.totalCount} 张截图')} · ${_jobStatus(job.status)}',
                                  subtitle: formatDateTime(job.createdAt),
                                  onTap: () async {
                                    await context.push(
                                      '/imports/screenshots/${job.id}',
                                    );
                                    _refreshJobs();
                                  },
                                ),
                            ],
                          );
                        },
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ImportStep extends StatelessWidget {
  const _ImportStep({required this.number, required this.label});

  final int number;
  final String label;

  @override
  Widget build(BuildContext context) {
    final t = context.ze;
    return Column(
      children: [
        Container(
          width: 24,
          height: 24,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: t.primarySoft,
            shape: BoxShape.circle,
          ),
          child: Text(
            '$number',
            style: TextStyle(
              color: t.accentText,
              fontSize: 12,
              fontWeight: FontWeight.w800,
            ),
          ),
        ),
        const SizedBox(height: 6),
        Text(
          label,
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.titleSmall,
        ),
      ],
    );
  }
}

String _jobStatus(String status) => switch (status) {
  'processing' => tr('Recognizing', '识别中'),
  'reviewing' => tr('Awaiting review', '待核对'),
  'completed' => tr('Completed', '已完成'),
  'failed' => tr('Failed', '失败'),
  _ => status,
};
